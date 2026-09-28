# Voneo on GCP

Voneo is a peer-to-peer video chat app. This stack runs its Astro frontend and Express signalling API on Cloud Run, with a Cloud SQL MySQL database. The frontend serves the app and forwards API and WebSocket requests to the backend. Setup and architecture: [`infra/README.md`](https://github.com/stephen-ingham/p2p-video-chat-web-app/blob/main/infra/README.md).

<!-- ephemeral -->

> **Ephemeral stack.** It's deployed for one e2e run and destroyed straight after (`scripts/gcp-e2e.mjs`). If resources are still listed here after a run finished, the teardown failed. The stack keeps billing (about $1/day) until you destroy it. See [Operating it](#operating-it).

<!-- /ephemeral -->
<!-- prod -->

> **Long-lived production stack.** `deploy-prod.yml` deploys it on every merge to `main`. The Cloud SQL instance has deletion protection.

<!-- /prod -->

## At a glance

|                      |                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| App                  | ${outputs.appUrl}                                                                                        |
| Deployed commit      | [`${outputs.gitSha}`](https://github.com/stephen-ingham/p2p-video-chat-web-app/commit/${outputs.gitSha}) |
| GCP project / region | `${outputs.project}` / `${outputs.region}`                                                               |

## Console links

- Backend (Cloud Run): [metrics](https://console.cloud.google.com/run/detail/${outputs.region}/${outputs.backendServiceName}/metrics?project=${outputs.project}), [logs](https://console.cloud.google.com/run/detail/${outputs.region}/${outputs.backendServiceName}/logs?project=${outputs.project})
- Frontend (Cloud Run): [metrics](https://console.cloud.google.com/run/detail/${outputs.region}/${outputs.frontendServiceName}/metrics?project=${outputs.project}), [logs](https://console.cloud.google.com/run/detail/${outputs.region}/${outputs.frontendServiceName}/logs?project=${outputs.project})
- [Cloud SQL instance `${outputs.dbInstanceName}`](https://console.cloud.google.com/sql/instances/${outputs.dbInstanceName}/overview?project=${outputs.project})
- [Secret Manager](https://console.cloud.google.com/security/secret-manager?project=${outputs.project})
<!-- turn -->
- [TURN VM `${outputs.turnVm}`](https://console.cloud.google.com/compute/instancesDetail/zones/${outputs.region}-a/instances/${outputs.turnVm}?project=${outputs.project})
<!-- /turn -->
- [Billing](https://console.cloud.google.com/billing/linkedaccount?project=${outputs.project})

<!-- turn -->

## TURN

- **Server:** `${outputs.turnIp}:3478` (UDP and TCP), relay ports `49152-49252` UDP.
- **Check it works:** log in to the app and copy the `iceServers` from the `GET /call/ice-servers` response (devtools → Network). Enter them on the [Trickle ICE page](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/) and gather candidates. A `relay` candidate means TURN works, `srflx` means STUN works.
- **After rotating `turnSecret`**, reset the VM so coturn picks up the new secret:

  ```bash
  gcloud compute instances reset ${outputs.turnVm} --zone ${outputs.region}-a --project ${outputs.project}
  ```

  <!-- /turn -->

## Operating it

<!-- ephemeral -->

From the repo's `infra/` folder (run `gcloud auth application-default login` first):

| Command                    | What it does                          |
| -------------------------- | ------------------------------------- |
| `npm run deploy:<stack>`   | `pulumi up`, non-interactive          |
| `npm run test:e2e:<stack>` | Runs the e2e suite against this stack |
| `npm run destroy:<stack>`  | Destroys every resource in this stack |

`<stack>` is `dev` or `prod-preview`.

<!-- /ephemeral -->
<!-- prod -->

- Deploys run from `deploy-prod.yml` on merge to `main`. For a manual deploy, run `pulumi up --stack prod` from `infra/`.
- `pulumi destroy --stack prod` removes everything except the Cloud SQL instance, which has deletion protection.
<!-- /prod -->
- Read the backend's logs from a terminal:

  ```bash
  gcloud run services logs read ${outputs.backendServiceName} --region ${outputs.region} --project ${outputs.project}
  ```

- Calls are held in memory, and each Cloud Run service is capped at one instance. A backend restart or redeploy drops every active call.
