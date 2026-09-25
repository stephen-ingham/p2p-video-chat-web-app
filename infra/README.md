# Voneo infrastructure (Pulumi on GCP)

`index.ts` and `turn-server.ts` declare everything the app needs on Google Cloud. One `pulumi up` builds and pushes both Docker images and creates or updates every resource. There's a `dev` and a `prod` stack, and each deploys into **its own GCP project**.

## What gets created

| Resource                                                                                                                  | What it's for                                                                                                                     | Closest AWS equivalent                     |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| GCP project (created by hand, see below)                                                                                  | Boundary for billing, IAM and resources                                                                                           | An AWS account                             |
| `gcp.projects.Service` (×7)                                                                                               | Turns on each GCP API the stack uses. APIs start off in a new project                                                             | No equivalent (AWS services are always on) |
| VPC `voneo-<stack>` + subnet `10.10.0.0/24`                                                                               | Network for the TURN VM                                                                                                           | VPC + subnet                               |
| Proxy-only subnet `10.10.2.0/23`                                                                                          | Where the load balancer's managed proxies run. Required for a regional ALB                                                        | No equivalent (ALBs pick their own ENIs)   |
| Artifact Registry repo `voneo`                                                                                            | Holds the `voneo-backend` / `voneo-frontend` images                                                                               | ECR repository                             |
| `docker-build` images (×2)                                                                                                | Pulumi builds the prod Dockerfiles and pushes them, then deploys by digest                                                        | `docker build` + `docker push` in CI       |
| Cloud Run `voneo-frontend-<stack>` / `voneo-backend-<stack>`                                                              | Serverless containers. Scale to zero, max 1 instance (calls are held in memory)                                                   | App Runner / ECS on Fargate                |
| Service accounts `voneo-backend-`, `voneo-frontend-`, `voneo-turn-<stack>`                                                | The identity each workload runs as                                                                                                | IAM roles for tasks/instances              |
| Cloud SQL `voneo-db-<stack>` (MySQL 8.4, `db-f1-micro`) + database + user `voneo`                                         | The app database                                                                                                                  | RDS for MySQL                              |
| Secret Manager secrets (DB password, JWT secrets, TURN secret)                                                            | Injected into Cloud Run as env vars                                                                                               | Secrets Manager                            |
| Regional external Application Load Balancer (IP, NEGs, backend services, URL map, HTTPS + HTTP proxies, forwarding rules) | Public entry point. `/auth/*`, `/call/*` and `/wss/*` go to the backend, everything else to the frontend. HTTP redirects to HTTPS | ALB with listener rules and target groups  |
| Certificate Manager certificate + DNS authorization                                                                       | Google-managed TLS certificate for your domain                                                                                    | ACM certificate with DNS validation        |
| coturn VM `voneo-turn-<stack>` (only when `turnEnabled`, i.e. prod)                                                       | STUN/TURN relay, with a static IP and firewall rule                                                                               | EC2 instance + Elastic IP + security group |

A few GCP concepts that work differently from AWS:

- **IAM is attached to resources, not identities.** Rather than writing a policy document for a role, you grant a _role_ (a predefined bundle of permissions, e.g. `roles/cloudsql.client`) to a _member_ (e.g. a service account) on a resource or project. `SecretIamMember` and `projects.IAMMember` in `index.ts` do exactly this.
- **Service accounts are like IAM roles for workloads.** Each Cloud Run service and the VM runs as its own service account and gets credentials automatically from the metadata server, so there are no keys to manage.
- **Cloud SQL connector.** The database has a public IP but no allowed networks, so nothing can connect to it directly. Cloud Run mounts a Unix socket at `/cloudsql/<connection name>` that tunnels through Google's connector, which checks the service account has `roles/cloudsql.client`. It does the same job as RDS IAM authentication plus RDS Proxy, without the VPC setup.
- **Serverless NEGs** point the load balancer at a Cloud Run service. They're the equivalent of a target group whose target is a Lambda or Fargate service.
- **Workload Identity Federation** lets GitHub Actions deploy without a stored key. It works like an AWS IAM OIDC identity provider plus `AssumeRoleWithWebIdentity`.

## One-time setup (per stack)

Do everything below once for `dev` and once for `prod`, each with its own project. You'll need the [gcloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud auth login` first), the [Pulumi CLI](https://www.pulumi.com/docs/install/) (`pulumi login`), a billing account, and a domain you can add DNS records to.

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

Each stack has its own project, so set these as **environment** secrets on the `dev` / `prod` GitHub environments (Settings → Environments). The deploy workflows already run in those environments.

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

You can also require a manual approval on the `prod` environment, so each deploy waits for you.

### 4. Create the Pulumi stack and its config

From `infra/`:

```bash
pulumi stack init $STACK
pulumi config set gcp:project $PROJECT_ID --stack $STACK
pulumi config set domain <app hostname, e.g. voneo.example.com> --stack $STACK
pulumi config set --secret dbPassword "$(openssl rand -hex 24)" --stack $STACK
pulumi config set --secret jwtSecret "$(openssl rand -hex 32)" --stack $STACK
pulumi config set --secret refreshTokenSecret "$(openssl rand -hex 32)" --stack $STACK
pulumi config set --secret turnSecret "$(openssl rand -hex 32)" --stack $STACK  # prod (turnEnabled) only
```

This writes to `Pulumi.<stack>.yaml`. The secret values are encrypted by Pulumi Cloud, so the file is safe to commit.

### 5. First deploy and DNS

Run the first deploy locally so you can watch it (`gcloud auth application-default login` gives Pulumi your credentials), or merge to `dev`/`main` to let the workflow run it:

```bash
pulumi up --stack $STACK
pulumi stack output lbIp --stack $STACK
pulumi stack output certDnsRecords --stack $STACK
```

At your DNS provider, add:

- an `A` record for your domain pointing at `lbIp`
- the `CNAME` from `certDnsRecords` (it proves you own the domain, so Google can issue the TLS certificate)

The certificate usually becomes active within 15–60 minutes of the records resolving. Until then, HTTPS requests fail with a TLS error. Check its status with `gcloud certificate-manager certificates list --location europe-west2 --project $PROJECT_ID`.

## Costs

Rough monthly cost per stack, while idle:

- **Regional load balancer** (about $18): the forwarding rules are billed hourly.
- **Cloud SQL `db-f1-micro`** (about $8–10).
- **coturn VM and static IP** (a few dollars, prod only).
- **Everything else** (Cloud Run, Artifact Registry, Secret Manager) costs very little at this scale.

`pulumi destroy --stack <stack>` removes everything except the Cloud SQL instance, which has deletion protection. Turn that off in `index.ts` first if you really mean to delete it.

## Tests

`npm test` (run in CI by `pr-main.yml`) checks the program against a snapshot of the resources it declares, with GCP mocked (`tests/pulumi-snapshot.test.ts`). After an intentional change, regenerate the snapshot with `UPDATE_SNAPSHOT=1 npm test`.
