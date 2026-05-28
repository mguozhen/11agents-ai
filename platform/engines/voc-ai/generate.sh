#!/bin/bash
# Solvea Content Engine — Quick Generate
# Usage: ./generate.sh "your topic here" [platforms]
# Examples:
#   ./generate.sh "The hidden cost of missed calls"
#   ./generate.sh "AI receptionist vs human receptionist" "x,linkedin"
#   ./generate.sh "Why Google Ads fail without phone coverage" "youtube"

TOPIC="$1"
PLATFORMS="${2:-x,linkedin,youtube}"

if [ -z "$TOPIC" ]; then
    echo "Usage: ./generate.sh \"your topic\" [platforms]"
    echo ""
    echo "Platforms: x, linkedin, youtube, instagram, tiktok, threads, facebook, newsletter"
    echo "Default: x,linkedin,youtube"
    echo ""
    echo "Examples:"
    echo "  ./generate.sh \"The hidden cost of missed calls\""
    echo "  ./generate.sh \"AI vs human receptionist\" \"x,linkedin,youtube,instagram\""
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🔧 Solvea Content Engine"
echo "📝 Topic: $TOPIC"
echo "📱 Platforms: $PLATFORMS"
echo ""

cd "$SCRIPT_DIR"

claude --print "Topic: $TOPIC

Produce platform-native posts for: $PLATFORMS

Follow the skill graph: read index.md first, then use hooks.md for opening lines, repurpose.md for the production chain, brand-voice.md for tone, and each platform's specific file for format rules.

Each platform post must use a DIFFERENT angle — rethought, not reformatted. Include specific data points from brand-voice.md proof points. Output each post separately, clearly labeled, ready to copy-paste."
