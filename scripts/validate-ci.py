from pathlib import Path
import sys

try:
    import yaml
except ImportError as exc:
    raise SystemExit(f"PyYAML is required for CI validation: {exc}")

workflow_path = Path(__file__).parents[1] / ".github" / "workflows" / "ci.yml"
workflow = yaml.safe_load(workflow_path.read_text(encoding="utf-8"))

jobs = workflow.get("jobs", {})
required_jobs = {"quality", "security", "container", "dast"}
missing_jobs = required_jobs.difference(jobs)
if missing_jobs:
    raise SystemExit(f"Missing required CI jobs: {sorted(missing_jobs)}")

quality_services = set(jobs["quality"].get("services", {}))
if not {"postgres", "redis", "minio"}.issubset(quality_services):
    raise SystemExit(f"Quality job is missing infrastructure services: {sorted(quality_services)}")

quality_text = str(jobs["quality"])
required_quality_tokens = [
    "prisma migrate deploy",
    "db:check",
    "test:cov",
    "test:e2e",
    "architecture:check",
]
for token in required_quality_tokens:
    if token not in quality_text:
        raise SystemExit(f"Quality job is missing required command: {token}")

security_text = str(jobs["security"])
for token in ["gitleaks", "semgrep", "trivy", "sbom"]:
    if token.lower() not in security_text.lower():
        raise SystemExit(f"Security job is missing required control: {token}")

print("CI workflow structure and required gates are present.")
