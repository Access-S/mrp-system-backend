#!/bin/bash
# ================================================================
# update-structure.sh — Backend Project Structure Generator
# Usage: bash update-structure.sh
# ================================================================

# Fix Unicode encoding for Git Bash / MINGW
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

OUTPUT_FILE="project-structure.txt"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

file_count=0
dir_count=0

print_tree() {
    local dir="$1"
    local prefix="$2"
    local dirs=()
    local files=()

    while IFS= read -r name; do
        [ -z "$name" ] && continue
        local path="$dir/$name"

        case "$name" in
            node_modules|.git|dist|build|coverage|.DS_Store|.vscode|.idea|\
__pycache__|.pytest_cache|.mypy_cache|*.pyc|venv|.venv|env|\
.terraform|.serverless|tmp|temp|logs|*.log|\
target|bin|obj|vendor|.gradle|.next) continue ;;
        esac

        if [ -d "$path" ]; then
            dirs+=("$path")
        else
            files+=("$path")
        fi
    done < <(ls -1A "$dir" 2>/dev/null)

    local items=("${dirs[@]}" "${files[@]}")
    local total=${#items[@]}
    local i=0

    for item in "${items[@]}"; do
        i=$((i + 1))
        local name=$(basename "$item")

        if [ "$i" -eq "$total" ]; then
            local branch="└── "
            local child_prefix="${prefix}    "
        else
            local branch="├── "
            local child_prefix="${prefix}│   "
        fi

        if [ -d "$item" ]; then
            dir_count=$((dir_count + 1))

            local child_count
            child_count=$(ls -1A "$item" 2>/dev/null | wc -l)

            if [ "$child_count" -eq 0 ]; then
                echo "${prefix}${branch}${name}/  (empty)"
            else
                echo "${prefix}${branch}${name}/"
                print_tree "$item" "$child_prefix"
            fi
        else
            file_count=$((file_count + 1))
            local icon=""
            case "$name" in
                # TypeScript / JavaScript
                *.ts)              icon="[TS]     " ;;
                *.tsx)             icon="[TSX]    " ;;
                *.js)              icon="[JS]     " ;;
                *.mjs|*.cjs)       icon="[JS]     " ;;

                # Python
                *.py)              icon="[PY]     " ;;
                *.pyi)             icon="[PY]     " ;;

                # Go
                *.go)              icon="[GO]     " ;;
                go.mod|go.sum)     icon="[GO]     " ;;

                # Java / Kotlin
                *.java)            icon="[JAVA]   " ;;
                *.kt)              icon="[KT]     " ;;
                *.gradle)          icon="[GRADLE] " ;;

                # C# / .NET
                *.cs)              icon="[CS]     " ;;
                *.csproj)          icon="[PROJ]   " ;;
                *.sln)             icon="[SLN]    " ;;

                # Rust
                *.rs)              icon="[RS]     " ;;
                Cargo.toml)        icon="[CARGO]  " ;;

                # Config & Data
                *.json)            icon="[JSON]   " ;;
                *.yaml|*.yml)      icon="[YAML]   " ;;
                *.toml)            icon="[TOML]   " ;;
                *.xml)             icon="[XML]    " ;;
                *.ini|*.cfg)       icon="[CFG]    " ;;
                *.conf)            icon="[CONF]   " ;;

                # Database
                *.sql)             icon="[SQL]    " ;;
                *.prisma)          icon="[PRISMA] " ;;

                # Web
                *.html)            icon="[HTML]   " ;;
                *.css)             icon="[CSS]    " ;;

                # Docs
                *.md)              icon="[MD]     " ;;
                *.txt)             icon="[TXT]    " ;;
                *.rst)             icon="[RST]    " ;;

                # Environment & Config
                .env*|*.env)       icon="[ENV]    " ;;
                Dockerfile*)       icon="[DOCKER] " ;;
                docker-compose*)   icon="[DOCKER] " ;;
                Makefile)          icon="[MAKE]   " ;;
                Procfile)          icon="[PROC]   " ;;

                # Shell
                *.sh|*.bash)       icon="[SH]     " ;;
                *.bat|*.cmd)       icon="[BAT]    " ;;
                *.ps1)             icon="[PS]     " ;;

                # Images & Assets
                *.svg|*.png|*.jpg|*.jpeg|*.gif|*.ico)
                                   icon="[IMG]    " ;;

                # Lock files
                *.lock)            icon="[LOCK]   " ;;
                package-lock.json) icon="[LOCK]   " ;;

                # Certificates & Keys
                *.pem|*.key|*.crt) icon="[CERT]   " ;;

                # Git & Editor configs
                .gitignore)        icon="[GIT]    " ;;
                .gitkeep)          icon="[GIT]    " ;;
                .dockerignore)     icon="[DOCKER] " ;;
                .editorconfig)     icon="[CFG]    " ;;
                .prettierrc*)      icon="[CFG]    " ;;
                .eslintrc*)        icon="[CFG]    " ;;

                # Catch-all
                *)                 icon="         " ;;
            esac
            echo "${prefix}${branch}${icon}${name}"
        fi
    done
}

# ==================== DETECT PROJECT NAME ====================

PROJECT_NAME=$(basename "$(pwd)")

# ======================== GENERATE OUTPUT ========================

{
    echo "+----------------------------------------------------------+"
    echo "|                                                          |"
    echo "|          BACKEND PROJECT STRUCTURE                       |"
    printf "|          %-47s |\n" "$PROJECT_NAME"
    echo "|                                                          |"
    echo "|          Generated: $TIMESTAMP                  |"
    echo "|                                                          |"
    echo "+----------------------------------------------------------+"
    echo ""
    echo "  ${PROJECT_NAME}/"
    echo "  |"
    print_tree "." "  "
    echo ""
    echo "+----------------------------------------------------------+"
    printf "|  SUMMARY:  Folders: %-4s | Files: %-4s | Total: %-7s  |\n" \
        "$dir_count" "$file_count" "$((dir_count + file_count))"
    echo "+----------------------------------------------------------+"
} > "$OUTPUT_FILE"

# Terminal feedback
echo ""
echo "  ✅ Project structure saved to $OUTPUT_FILE"
echo ""
echo "  ┌─────────────────────────────────────┐"
printf "  │  📂 Folders:  %-21s │\n" "$dir_count"
printf "  │  📄 Files:    %-21s │\n" "$file_count"
printf "  │  📦 Total:    %-21s │\n" "$((dir_count + file_count))"
echo "  └─────────────────────────────────────┘"
echo ""

