import os
import sys
import json
import base64
import urllib.request
from datetime import datetime

TOKEN = os.environ.get("GITHUB_TOKEN")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
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

def get_repo_context(repo_name):
    # Fetch tasks.md
    url = f"https://api.github.com/repos/{ORG}/{repo_name}/contents/tasks.md"
    tasks, _ = github_request(url)
    context = ""
    if tasks:
        content = base64.b64decode(tasks["content"]).decode()
        # Get last checked task
        lines = content.split('\n')
        checked = [line for line in lines if "- [x]" in line]
        if checked:
            context = f"Latest achievement: {checked[-1].strip('- [x] ')}"
    
    repo_info, _ = github_request(f"https://api.github.com/repos/{ORG}/{repo_name}")
    desc = repo_info.get("description", "No description")
    
    return {"name": repo_name, "description": desc, "latest_task": context}

def generate_content(context):
    repo = context['name']
    task = context['latest_task']
    desc = context['description']
    
    prompt = f"Building {repo} in public! {task}. {desc}. #aiulu #solofounder #automation"
    
    # Template fallback if no API key
    content = {
        "linkedin": f"🚀 Big update from the ai-ulu fortress! \n\nWe've just reached a major milestone in {repo}: {task}.\n\n{desc}\n\nThis is another step towards the fully autonomous QA and Engineering future. #AutoQAPilot #AgenticEngineering #SoloFounder",
        "twitter": f"Building {repo} in public 🚀\n\nLatest win: {task}\n\nAutonomous systems are scaling. The tech fortress grows stronger. 🛡️\n\n#BuildInPublic #AI #Engineering #aiulu",
        "dashboard": {
            "title": f"{repo} Progress Update",
            "message": f"Successfully completed: {task}",
            "timestamp": datetime.now().isoformat()
        }
    }
    
    return content

def save_to_github(repo_name, content):
    path = f"marketing/outputs/post_{datetime.now().strftime('%Y%m%d_%H%M')}.md"
    url = f"https://api.github.com/repos/{ORG}/{repo_name}/contents/{path}"
    
    md_content = f"""# Marketing Content - {datetime.now().strftime('%Y-%m-%d %H:%M')}

## LinkedIn
{content['linkedin']}

---
## X (Twitter)
{content['twitter']}

---
## Dashboard Data
```json
{json.dumps(content['dashboard'], indent=2)}
```
"""
    b64_content = base64.b64encode(md_content.encode()).decode()
    
    # Check default branch
    repo_info, _ = github_request(f"https://api.github.com/repos/{ORG}/{repo_name}")
    branch = repo_info.get("default_branch", "main")
    
    github_request(url, method="PUT", data={
        "message": "📣 Media Agent: Generated marketing content",
        "content": b64_content,
        "branch": branch
    })
    
    # Open Issue for Approval
    issue_url = f"https://api.github.com/repos/{ORG}/{repo_name}/issues"
    github_request(issue_url, method="POST", data={
        "title": f"📢 Content Approval Required: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "body": f"The Media Agent has generated new content for review.\n\nView it here: {path}\n\nClose this issue to mark as 'Published'."
    })
    
    print(f"✅ Content saved and issue opened for {repo_name}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        repo = sys.argv[1]
        ctx = get_repo_context(repo)
        content = generate_content(ctx)
        save_to_github(repo, content)
    else:
        print("Usage: python media_agent.py <repo_name>")
