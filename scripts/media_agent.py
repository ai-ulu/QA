import os
import sys
import json
import base64
import urllib.request
from datetime import datetime
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

def get_context(repo_name):
    # 1. Fetch tasks.md
    tasks, _ = github_request(f"https://api.github.com/repos/{ORG}/{repo_name}/contents/tasks.md")
    latest_task = "System Optimization"
    if tasks:
        content = base64.b64decode(tasks["content"]).decode()
        checked = [line for line in content.split('\n') if "- [x]" in line]
        if checked: latest_task = checked[-1].strip("- [x] ")

    # 2. Fetch latest PRs
    prs, _ = github_request(f"https://api.github.com/repos/{ORG}/{repo_name}/pulls?state=closed&per_page=1")
    latest_pr = prs[0]['title'] if prs else "Code refinement"

    # 3. Check for recent Chaos recovery
    # We look for PRs with "Autonomous Self-Healing" in title
    healing_prs, _ = github_request(f"https://api.github.com/repos/{ORG}/{repo_name}/pulls?state=all&q=Self-Healing")
    chaos_context = ""
    if healing_prs:
        chaos_context = "Successfully repelled a chaos injection and self-healed."

    return {
        "repo": repo_name,
        "task": latest_task,
        "pr": latest_pr,
        "chaos": chaos_context
    }

def generate_godfather_content(ctx):
    repo = ctx['repo']
    task = ctx['task']
    chaos = ctx['chaos']
    
    # "GodFather" Persona Templates
    li_templates = [
        f"In the ai-ulu fortress, we don't wait for luck. We build resilience. {repo} just advanced: {task}. {chaos} The autonomous engine is purring. #SoloFounder #AgenticEngineering",
        f"Efficiency is the only currency in a SoloFounder's world. {repo} update: {task}. Our systems don't just run; they evolve. {chaos} #aiulu #Automation"
    ]
    
    tw_templates = [
        f"The tech fortress grows. 🛡️\n\n{repo}: {task}\n\n{chaos}\n\nOtonom gelecek bugün inşa ediliyor. 🚀 #aiulu #BuildInPublic",
        f"Chaos is an opportunity. 🐒\n\n{repo} just passed the latest tests: {task}.\n\nSelf-healing: Active. ✅\n\n#AgenticQA #Automation #SoloFounder"
    ]
    
    return {
        "linkedin": random.choice(li_templates),
        "twitter": random.choice(tw_templates),
        "dashboard": {
            "title": f"Strategic Update: {repo}",
            "message": f"{task}. {chaos}",
            "timestamp": datetime.now().isoformat()
        }
    }

def save_and_issue(repo_name, content):
    # (Same save logic as before, just updated content)
    path = f"marketing/outputs/godfather_update_{datetime.now().strftime('%Y%m%d_%H%M')}.md"
    url = f"https://api.github.com/repos/{ORG}/{repo_name}/contents/{path}"
    
    md_content = f"# 🛡️ GodFather Strategic Content\n\n## LinkedIn\n{content['linkedin']}\n\n## X\n{content['twitter']}\n\n## Data\n{json.dumps(content['dashboard'])}"
    b64 = base64.b64encode(md_content.encode()).decode()
    
    repo_info, _ = github_request(f"https://api.github.com/repos/{ORG}/{repo_name}")
    github_request(url, method="PUT", data={"message": "🛡️ Media Agent: GodFather Persona Content", "content": b64, "branch": repo_info.get("default_branch", "main")})
    
    github_request(f"https://api.github.com/repos/{ORG}/{repo_name}/issues", method="POST", data={
        "title": f"🛡️ Strategic Content Approval: {repo_name}",
        "body": f"The GodFather has prepared a strategic update for {repo_name}.\n\n[Review Content]({repo_info['html_url']}/blob/{repo_info.get('default_branch', 'main')}/{path})"
    })

if __name__ == "__main__":
    if len(sys.argv) > 1:
        repo = sys.argv[1]
        ctx = get_context(repo)
        content = generate_godfather_content(ctx)
        save_and_issue(repo, content)
