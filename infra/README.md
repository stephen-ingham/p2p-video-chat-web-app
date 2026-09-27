# Voneo infrastructure (Pulumi on GCP)

`index.ts` and `turn-server.ts` declare everything the app needs on Google Cloud. One `pulumi up` builds and pushes both Docker images and creates or updates every resource. There are three stacks:

| Stack          | GCP project | Lifetime                                                                                           |
| -------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `dev`          | dev's own   | Ephemeral: deployed for one e2e run on a PR into `dev`, then destroyed                             |
| `prod-preview` | prod's      | Ephemeral: prod's settings (TURN on), deployed for one e2e run on a PR into `main`, then destroyed |
| `prod`         | prod's own  | Long-lived, deployed by `deploy-prod.yml` on merge to `main`                                       |

`dev` and `prod` each need **their own GCP project**: the load balancer's proxy-only subnet can only exist once per region per network. `prod-preview` shares prod's project, with every resource name suffixed by its stack name so the two don't collide. See [Ephemeral stacks](#ephemeral-stacks-dev-prod-preview) for how those work.

## What gets created

| Resource                                                                                                                  | What it's for                                                                                                                     | Closest AWS equivalent                     |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| GCP project (created by hand, see below)                                                                                  | Boundary for billing, IAM and resources                                                                                           | An AWS account                             |
| `gcp.projects.Service` (×7)                                                                                               | Turns on each GCP API the stack uses. APIs start off in a new project                                                             | No equivalent (AWS services are always on) |
| VPC `voneo-<stack>` + subnet `10.10.0.0/24`                                                                               | Network for the TURN VM                                                                                                           | VPC + subnet                               |
| Proxy-only subnet `10.10.2.0/23`                                                                                          | Where the load balancer's managed proxies run. Required for a regional ALB                                                        | No equivalent (ALBs pick their own ENIs)   |
| Artifact Registry repo `voneo-<stack>`                                                                                    | Holds the `voneo-backend` / `voneo-frontend` images                                                                               | ECR repository                             |
| `docker-build` images (×2)                                                                                                | Pulumi builds the prod Dockerfiles and pushes them, then deploys by digest                                                        | `docker build` + `docker push` in CI       |
| Cloud Run `voneo-frontend-<stack>` / `voneo-backend-<stack>`                                                              | Serverless containers. Scale to zero, max 1 instance (calls are held in memory)                                                   | App Runner / ECS on Fargate                |
| Service accounts `voneo-backend-`, `voneo-frontend-`, `voneo-turn-<stack>`                                                | The identity each workload runs as                                                                                                | IAM roles for tasks/instances              |
| Cloud SQL `voneo-db-<stack>` (MySQL 8.4, `db-f1-micro`) + database + user `voneo`                                         | The app database. Ephemeral stacks add a random suffix to the name, e.g. `voneo-db-dev-4f9c2e1`                                   | RDS for MySQL                              |
| Secret Manager secrets (DB password, JWT secrets, TURN secret)                                                            | Injected into Cloud Run as env vars                                                                                               | Secrets Manager                            |
| Regional external Application Load Balancer (IP, NEGs, backend services, URL map, HTTPS + HTTP proxies, forwarding rules) | Public entry point. `/auth/*`, `/call/*` and `/wss/*` go to the backend, everything else to the frontend. HTTP redirects to HTTPS | ALB with listener rules and target groups  |
| Certificate Manager certificate + DNS authorization (prod); self-signed regional SSL certificate (ephemeral stacks)       | TLS certificate for the domain. Ephemeral stacks use a placeholder domain with no DNS                                             | ACM certificate with DNS validation        |
| coturn VM `voneo-turn-<stack>` (only when `turnEnabled`: prod and prod-preview)                                           | STUN/TURN relay, with a static IP and firewall rule                                                                               | EC2 instance + Elastic IP + security group |

A few GCP concepts that work differently from AWS:

- **IAM is attached to resources, not identities.** Rather than writing a policy document for a role, you grant a _role_ (a predefined bundle of permissions, e.g. `roles/cloudsql.client`) to a _member_ (e.g. a service account) on a resource or project. `SecretIamMember` and `projects.IAMMember` in `index.ts` do exactly this.
- **Service accounts are like IAM roles for workloads.** Each Cloud Run service and the VM runs as its own service account and gets credentials automatically from the metadata server, so there are no keys to manage.
- **Cloud SQL connector.** The database has a public IP but no allowed networks, so nothing can connect to it directly. Cloud Run mounts a Unix socket at `/cloudsql/<connection name>` that tunnels through Google's connector, which checks the service account has `roles/cloudsql.client`. It does the same job as RDS IAM authentication plus RDS Proxy, without the VPC setup.
- **Serverless NEGs** point the load balancer at a Cloud Run service. They're the equivalent of a target group whose target is a Lambda or Fargate service.
- **Workload Identity Federation** lets GitHub Actions deploy without a stored key. It works like an AWS IAM OIDC identity provider plus `AssumeRoleWithWebIdentity`.

## One-time setup (per stack)

Do steps 1–2 once for `dev` and once for `prod`, each with its own project. Do steps 3–4 for all three stacks: `prod-preview` reuses prod's project and deploy identity. Step 5 is for `prod` only. You'll need the [gcloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud auth login` first), the [Pulumi CLI](https://www.pulumi.com/docs/install/) (`pulumi login`), a billing account, and, for prod, a domain you can add DNS records to.

### 1. Create the project

```bash
STACK=prod                                  # or dev
PROJECT_ID=voneo-$STACK-<something-unique>  # globally unique, 6–30 chars
REPO=stephen-ingham/p2p-video-chat-web-app

gcloud projects create $PROJECT_ID
gcloud billing accounts list                # copy your billing account ID
gcloud billing projects link $PROJECT_ID --billing-account=<BILLING_ACCOUNT_ID>

# APIs the GitHub deploy identity needs before Pulumi can enable the rest.
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com \
  sts.googleapis.com cloudresourcemanager.googleapis.com \
  serviceusage.googleapis.com --project $PROJECT_ID
```

### 2. Create the deploy identity for GitHub Actions

A service account for the deploy workflow, with the roles Pulumi needs to manage everything in `index.ts`:

```bash
DEPLOY_SA=github-deploy@$PROJECT_ID.iam.gserviceaccount.com
gcloud iam service-accounts create github-deploy --project $PROJECT_ID

for role in roles/run.admin roles/cloudsql.admin roles/secretmanager.admin \
  roles/compute.admin roles/certificatemanager.owner roles/artifactregistry.admin \
  roles/iam.serviceAccountAdmin roles/iam.serviceAccountUser \
  roles/resourcemanager.projectIamAdmin roles/serviceusage.serviceUsageAdmin; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member serviceAccount:$DEPLOY_SA --role $role --condition=None
done
```

Then let GitHub Actions runs from this repo, and only this repo, act as that service account (Workload Identity Federation):

```bash
gcloud iam workload-identity-pools create github \
  --location global --project $PROJECT_ID
gcloud iam workload-identity-pools providers create-oidc github \
  --location global --workload-identity-pool github --project $PROJECT_ID \
  --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition "assertion.repository=='$REPO'"

PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding $DEPLOY_SA --project $PROJECT_ID \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"

echo "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"
```

### 3. Add the GitHub secrets

Set these as **environment** secrets on the `dev`, `prod-preview` and `prod` GitHub environments (Settings → Environments). The workflows already run in those environments: `pr-dev.yml`'s `e2e-gcp-dev` job in `dev`, `pr-main.yml`'s `e2e-gcp-prod-preview` job in `prod-preview`, and `deploy-prod.yml` in `prod`. `prod-preview` gets the same values as `prod`, since it deploys into prod's project.

| Secret                           | Value                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | The `projects/.../providers/github` string printed above                                       |
| `GCP_DEPLOY_SERVICE_ACCOUNT`     | `github-deploy@<PROJECT_ID>.iam.gserviceaccount.com`                                           |
| `PULUMI_ACCESS_TOKEN`            | A token from Pulumi Cloud (Settings → Access tokens). The same one works for both environments |

```bash
gh secret set GCP_WORKLOAD_IDENTITY_PROVIDER --env $STACK --body "projects/..."
gh secret set GCP_DEPLOY_SERVICE_ACCOUNT --env $STACK --body "$DEPLOY_SA"
gh secret set PULUMI_ACCESS_TOKEN --env $STACK
```

You can also require a manual approval on the `prod` environment, so each deploy waits for you. Leave `dev` and `prod-preview` without one, or every PR's GCP e2e job waits for you too.

### 4. Create the Pulumi stack and its config

From `infra/`:

```bash
pulumi stack init $STACK
pulumi config set gcp:project $PROJECT_ID --stack $STACK  # prod-preview: prod's project
pulumi config set domain <app hostname, e.g. voneo.example.com> --stack $STACK  # prod only
pulumi config set --secret dbPassword "$(openssl rand -hex 24)" --stack $STACK
pulumi config set --secret jwtSecret "$(openssl rand -hex 32)" --stack $STACK
pulumi config set --secret refreshTokenSecret "$(openssl rand -hex 32)" --stack $STACK
pulumi config set --secret turnSecret "$(openssl rand -hex 32)" --stack $STACK  # prod and prod-preview (turnEnabled) only
```

This writes to `Pulumi.<stack>.yaml`. The secret values are encrypted by Pulumi Cloud, so the file is safe to commit. Give `prod-preview` its own values rather than prod's, so a preview deployment can't mint tokens or TURN credentials that prod accepts. The ephemeral stacks' `domain` is already set in their YAML files.

### 5. First deploy and DNS (prod only)

Run the first deploy locally so you can watch it (`gcloud auth application-default login` gives Pulumi your credentials), or merge to `main` to let the workflow run it:

```bash
pulumi up --stack $STACK
pulumi stack output lbIp --stack $STACK
pulumi stack output certDnsRecords --stack $STACK
```

At your DNS provider, add:

- an `A` record for your domain pointing at `lbIp`
- the `CNAME` from `certDnsRecords` (it proves you own the domain, so Google can issue the TLS certificate)

The certificate usually becomes active within 15–60 minutes of the records resolving. Until then, HTTPS requests fail with a TLS error. Check its status with `gcloud certificate-manager certificates list --location europe-west2 --project $PROJECT_ID`.

## Ephemeral stacks (dev, prod-preview)

`voneo-video-chat:ephemeral: true` in a stack's YAML makes it disposable:

- **No deletion protection** on Cloud SQL, so `pulumi destroy` removes everything.
- **An auto-named Cloud SQL instance.** GCP reserves a deleted instance's name for about a week, so a fixed name would block the next run. Pulumi adds a random suffix when it creates the instance and keeps it in the stack's state.
- **A self-signed certificate** for a placeholder `domain` (`dev.voneo.test`, `preview.voneo.test`) instead of a Google-managed one. Nothing needs DNS: the e2e browser maps the placeholder to the `lbIp` output itself (Chromium's `--host-resolver-rules`) and ignores the certificate error.

Every stack labels its Cloud SQL instance, Cloud Run services and TURN VM with the commit it was deployed from (`git-sha`), and whether there were uncommitted changes (`git-dirty`). The commit is also the `gitSha` stack output.

`scripts/gcp-e2e.mjs` drives them, from the repo root:

| Command                    | What it does                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `npm run gcp-deploy-dev`   | `pulumi up`, non-interactive                                                        |
| `npm run test:e2e:gcp-dev` | Waits until the stack serves, then runs the e2e suite against it                    |
| `npm run gcp-destroy-dev`  | `pulumi destroy`, non-interactive: removes every resource the stack created         |
| `npm run gcp-e2e-dev`      | All three. Destroys the stack even if the deploy or tests fail, or you press Ctrl+C |

The same four exist for `prod-preview` (`gcp-deploy-prod-preview`, and so on). Pass Playwright arguments after `--`, e.g. `npm run test:e2e:gcp-dev -- --grep @happy-path`. Locally, run `gcloud auth application-default login` first.

The NAT-traversal suite (`e2e/nat/`) isn't run against these stacks. It needs browsers on separate simulated LANs, which only the local Docker overlay provides.

In CI, `e2e-gcp-dev` (`pr-dev.yml`) and `e2e-gcp-prod-preview` (`pr-main.yml`) run the deploy, test and destroy as separate steps, with the destroy step on `if: always()`. Each stack is shared, so runs queue one at a time (a `concurrency` group). If a newer run starts queueing while one is already waiting, GitHub cancels the waiting one. Fork PRs don't get GCP credentials, so the jobs skip them. The jobs deploy the PR's head commit rather than GitHub's merge commit, so `git-sha` is a commit you can find.

If a teardown ever fails, the stack keeps billing until you run `npm run gcp-destroy-dev` (or `gcp-destroy-prod-preview`). `pulumi stack --stack dev` lists what's left.

## Stack README and outputs

Each stack's page in Pulumi Cloud shows a stack README: its app URL, load balancer IP, deployed commit, GCP console links (Cloud Run metrics and logs, Cloud SQL, load balancer, TURN VM, billing) and operating commands. The template is `Pulumi.README.md`. `index.ts` exports it as the `readme` stack output, which is the name Pulumi Cloud looks for, and Pulumi Cloud fills in its `${outputs.<name>}` placeholders. Pulumi has no conditionals, so `index.ts` first drops sections wrapped in `<!-- ephemeral -->`, `<!-- prod -->` or `<!-- turn -->` markers that don't apply to the stack.

Stack outputs, also readable with `pulumi stack output <name> --stack <stack>`:

| Output                                       | Value                                                           |
| -------------------------------------------- | --------------------------------------------------------------- |
| `appHost`                                    | The stack's `domain`                                            |
| `lbIp`                                       | The load balancer's public IP                                   |
| `gitSha`                                     | The commit deployed                                             |
| `certDnsRecords`                             | The certificate's DNS authorization record (prod only)          |
| `turnIp` / `turnVm`                          | The TURN VM's static IP and name (only when `turnEnabled`)      |
| `project` / `region`                         | The GCP project and region deployed into                        |
| `backendServiceName` / `frontendServiceName` | The Cloud Run service names                                     |
| `dbInstanceName`                             | The Cloud SQL instance name (random suffix on ephemeral stacks) |
| `readme`                                     | The rendered stack README                                       |

`package.json` sets `"type": "module"`, which Pulumi's built-in TypeScript support (ts-node) can't load. So `Pulumi.yaml` turns that off (`typescript: false`) and runs `index.ts` through `tsx` instead (`nodeargs: --import tsx`), as the tests do.

## Costs

Ephemeral stacks cost cents per run: each exists for about 30–45 minutes, and the load balancer and Cloud SQL are billed by the second or hour. Rough monthly cost of a long-lived stack, while idle:

- **Regional load balancer** (about $18): the forwarding rules are billed hourly.
- **Cloud SQL `db-f1-micro`** (about $8–10).
- **coturn VM and static IP** (a few dollars, prod only).
- **Everything else** (Cloud Run, Artifact Registry, Secret Manager) costs very little at this scale.

On `prod`, `pulumi destroy --stack prod` removes everything except the Cloud SQL instance, which has deletion protection. Turn that off in `index.ts` first if you really mean to delete it.

## Tests

`npm test` (run in CI by `pr-main.yml`) checks the program against a snapshot of the resources it declares, with GCP mocked: `tests/prod.test.ts` with prod's config, and `tests/ephemeral.test.ts` with the ephemeral stacks' config (shared code in `tests/snapshot.ts`). After an intentional change, regenerate the snapshot with `UPDATE_SNAPSHOT=1 npm test`.
