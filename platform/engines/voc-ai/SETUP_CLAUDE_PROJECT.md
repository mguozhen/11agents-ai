# How to Set Up Claude Projects with This Skill Graph

## Steps

1. Go to https://claude.ai
2. Click "Projects" in the left sidebar
3. Click "New Project" → name it "Solvea Content Engine"
4. In the project, click "Add knowledge" (or the paperclip icon)
5. Upload ALL 17 .md files from this folder:
   - index.md
   - platforms/x.md, linkedin.md, youtube.md, instagram.md, tiktok.md, threads.md, facebook.md, newsletter.md
   - voice/brand-voice.md, platform-tone.md
   - engine/hooks.md, repurpose.md, scheduling.md, content-types.md
   - audience/builders.md, casual.md
6. In "Project instructions" paste:

---
You are Solvea's content production agent. When I give you a topic:
1. Read index.md first for system overview
2. Follow the repurposing chain in repurpose.md
3. Produce platform-native posts (rethought, not reformatted)
4. Use hooks from hooks.md
5. Match brand-voice.md tone
6. Each platform post should use a DIFFERENT angle on the topic
---

7. Start a new conversation in this project
8. Give it a topic: "Topic: [your idea]. Produce for X, LinkedIn, YouTube."

## Tips
- Every conversation in this project has access to all 17 files automatically
- You don't need to re-upload files each time
- Update files when you learn what hooks perform best
