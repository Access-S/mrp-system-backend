#!/bin/bash

echo "🔄 Updating Backend project structure..."

if command -v tree &> /dev/null; then
    tree -I 'node_modules|dist|build|.git|coverage' -L 4 --dirsfirst > project-structure.txt
else
    find . -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.git/*' -not -path '*/coverage/*' | sed 's|^\./||' | sort > project-structure.txt
fi

git add project-structure.txt
git commit -m "docs: Update project structure documentation"
git push origin HEAD  # This pushes to your current branch

echo "✅ Backend project structure updated!"