# Codefarm

Codefarm's application code. Its infrastructure is in [codefarm-infra](https://github.com/medusa-software-hq/codefarm-infra).

Changes are proposed as pull requests and checked there.

## Local development

Run the service, then the frontend, and open the URL Vite prints:

```sh
task gradle:runService
task frontend:dev
```

The frontend's dev server stands in for the Worker, forwarding `/api/*` to the service as a fixed caller.
