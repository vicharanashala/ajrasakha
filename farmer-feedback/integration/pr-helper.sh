#!/bin/bash
# AjraSakha Feedback Integration - PR Helper Script

echo "=================================================="
echo " AjraSakha Feedback Integration - PR Setup"
echo "=================================================="
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) not found."
    echo ""
    echo "Install from: https://cli.github.com/"
    echo "Or run: brew install gh"
    exit 1
fi

# Check if logged in
gh auth status || {
    echo "❌ Not logged in to GitHub CLI"
    echo "Run: gh auth login"
    exit 1
}

echo "✅ GitHub CLI authenticated"
echo ""

# Get repo info
REPO="vicharanashala/ajrasakha"
FORK_REPO=""

echo "Enter your fork URL (or press Enter to create one):"
echo "Example: https://github.com/yourusername/ajrasakha"
read -r FORK_URL

if [ -z "$FORK_URL" ]; then
    echo ""
    echo "Creating fork..."
    gh repo fork "$REPO" --clone --depth 1
    FORK_DIR="ajrasakha"
else
    FORK_DIR=$(basename "$FORK_URL" .git)
    if [ ! -d "$FORK_DIR" ]; then
        gh repo clone "$FORK_URL" -- -depth 1
    fi
fi

cd "$FORK_DIR" || exit 1

echo ""
echo "Current directory: $(pwd)"
echo ""

# Create feature branch
BRANCH_NAME="feat/farmer-feedback-system"
echo "Creating branch: $BRANCH_NAME"
git checkout -b "$BRANCH_NAME"

echo ""
echo "=================================================="
echo "Now copy these files to your fork:"
echo "=================================================="
echo ""
echo "1. BACKEND ROUTE"
echo "   Create: backend/src/modules/feedback/routes.js"
echo "   Content: See integration/backend/feedback/routes.js"
echo ""
echo "2. FRONTEND COMPONENT"
echo "   Create: frontend/src/components/feedback/FeedbackButtons.jsx"
echo "   Content: See integration/frontend/src/components/feedback/FeedbackButtons.jsx"
echo ""
echo "3. WHATSAPP INTEGRATION"
echo "   Create: whatsapp-integration/whatsapp-feedback.js"
echo "   Content: See integration/whatsapp-integration/whatsapp-feedback.js"
echo ""
echo "4. UPDATE BACKEND"
echo "   Edit: backend/src/app.js"
echo "   Add after existing imports: const feedbackRouter = require('./modules/feedback/routes');"
echo "   Add after existing routes: app.use('/api/feedback', feedbackRouter);"
echo ""
echo "=================================================="
echo "After copying files:"
echo "=================================================="
echo ""
echo "git add ."
echo "git commit -m \"feat: Add farmer feedback collection system\""
echo "git push origin $BRANCH_NAME"
echo ""
echo "Then create PR with:"
echo "gh pr create --repo $REPO --title \"feat: Add farmer feedback collection system\" --body-file - <<EOF"
echo "## Summary"
echo "Adds farmer feedback collection with:"
echo "- Feedback buttons after GDB answers"
echo "- Stats dashboard per entry/domain/language/state"
echo "- Auto-flagging of low-rated entries"
echo "- WhatsApp feedback integration"
echo "EOF"
echo ""
echo "=================================================="
echo "Or use the manual PR guide: integration/docs/PR_GUIDE.md"
echo "=================================================="