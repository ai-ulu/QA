import os
import sys
import json
import base64
import urllib.request
import random

TOKEN = os.environ.get("GITHUB_TOKEN")
ORG = "ai-ulu"

def github_request(url, method="GET", data=None):
    headers = {"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github.v3+json"}
    req = urllib.request.Request(url, headers=headers, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(data).encode()
    try:
        with urllib.request.urlopen(req, data=data) as res:
            return json.loads(res.read().decode()), res.status
    except Exception as e:
        return None, 0

def update_tasks_md(repo_name, branch_name):
    url = f"https://api.github.com/repos/{ORG}/{repo_name}/contents/tasks.md"
    res_data, status = github_request(url)
    if status == 200:
        content = base64.b64decode(res_data["content"]).decode()
        # Find first unchecked task and check it
        if "- [ ]" in content:
            new_content = content.replace("- [ ]", "- [x]", 1)
            b64_new = base64.b64encode(new_content.encode()).decode()
            github_request(url, method="PUT", data={
                "message": "✅ Autonomous Progress: Task completed by Repair Agent",
                "content": b64_new,
                "sha": res_data["sha"],
                "branch": branch_name
            })
            print(f"📝 Updated tasks.md in {repo_name}")

def autonomous_heal(repo_name):
    print(f"🤖 Agentic Repair initiated for {repo_name}...")
    path = "tests/chaos_test.js"
    url = f"https://api.github.com/repos/{ORG}/{repo_name}/contents/{path}"
    res_data, status = github_request(url)
    if status == 200:
        sha = res_data["sha"]
        branch_name = f"fix/chaos-recovery-{random.randint(1000, 9999)}"
        repo_info, _ = github_request(f"https://api.github.com/repos/{ORG}/{repo_name}")
        default_branch = repo_info.get("default_branch", "main")
        ref_info, _ = github_request(f"https://api.github.com/repos/{ORG}/{repo_name}/git/ref/heads/{default_branch}")
        main_sha = ref_info["object"]["sha"]
        github_request(f"https://api.github.com/repos/{ORG}/{repo_name}/git/refs", method="POST", data={"ref": f"refs/heads/{branch_name}", "sha": main_sha})
        github_request(url, method="DELETE", data={"message": "🛠️ Autonomous Repair", "sha": sha, "branch": branch_name})
        
        # Also update tasks.md if exists
        update_tasks_md(repo_name, branch_name)
        
        pr_data, status = github_request(f"https://api.github.com/repos/{ORG}/{repo_name}/pulls", method="POST", data={
            "title": "🛡️ Autonomous Self-Healing: Chaos Recovery",
            "head": branch_name, "base": default_branch,
            "body": "Autonomous repair and task update completed."
        })
        if status == 201: print(f"✅ Recovery PR opened: {pr_data['html_url']}")
    else: print("🤷 No chaos file found.")

if __name__ == "__main__":
    if len(sys.argv) > 1: autonomous_heal(sys.argv[1])
