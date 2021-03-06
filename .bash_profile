#===============================
# Vars
#===============================

bldblk='\e[1;30m' # Black - Bold
txtgrn='\e[0;32m' # Green
txtylw='\e[0;33m' # Yellow
txtwht='\e[0;37m' # White
txtcyn='\e[0;36m' # Cyan
txtpur='\e[0;35m' # Purple
txtong='\033[0;0;0;38;5;214m\]' # Orange

bldgrn='\e[1;32m' # Green
bldylw='\e[1;33m' # Yellow
bldred='\e[1;31m' # Red

#===============================
# Default Path
#===============================

PATH=/usr/bin:/bin:/usr/sbin:/sbin
PATH=/Users/$(whoami)/bin:/Users/$(whoami)/sbin:$PATH
PATH=/usr/local/bin:/usr/local/sbin:$PATH
PATH=/usr/local/mysql/bin:$PATH
PATH=/opt/local/bin:/opt/local/sbin:$PATH

#===============================
# Terminal Settings
#===============================

export CLICOLOR=1
export LSCOLORS=ExFxBxDxCxegedabagacad
alias ls='ls -GFh'

#===============================
# Custom Prompt Functions
#===============================

function parse_git_branch() {
    if git rev-parse --git-dir > /dev/null 2>&1; then
        BRANCH_NAME=$(git branch | grep \* | cut -d ' ' -f2)
        CHANGED=$(git status --porcelain)

        if [ -n "${CHANGED}" ]; then
            echo "$txtcyn $BRANCH_NAME*";
        else
            echo "$txtcyn $BRANCH_NAME";
        fi
    fi
}

function parse_npm_version() {
    if test -f package.json; then
        PACKAGE_VERSION=$(node -pe "require('./package.json').version")
        [[ -z $PACKAGE_VERSION ]] || [[ "$PACKAGE_VERSION" == "undefined" ]] && return
        echo "$txtpur 📦 $PACKAGE_VERSION"
    fi
}

function parse_aws_profile() {
    if command -v aws >/dev/null 2>&1; then
        [[ -z $AWS_PROFILE ]] || [[ "$AWS_PROFILE" == "default" ]] && return
        echo "$txtong ☁️  $AWS_PROFILE"
    fi
}

function parse_node_version() {
    if command -v nvm >/dev/null 2>&1; then
        echo "$txtgrn ⬢ $(nvm current)"
    fi
}

#===============================
# Configure Prompt
#===============================

set_prompt() {
    PS1="$bakblk"     # Background Color
    PS1=$PS1"\n" 	  # New Line
    PS1=$PS1"$txtgrn"
    PS1=$PS1"👨‍💻 " # User Details (green)
    PS1=$PS1"$txtylw""\w" # PWD
    PS1=$PS1"$(parse_git_branch)" # Git branch
    PS1=$PS1"$txtwht |" # New Line
    PS1=$PS1"$(parse_npm_version)" # NPM Package
    PS1=$PS1"$(parse_aws_profile)" # AWS Profile
    PS1=$PS1"$(parse_node_version)" # Node Version
    PS1=$PS1"\n" # New Line
    PS1=$PS1"$bldred"">""$bldylw"">""$bldgrn""> "
    PS1=$PS1"$txtwht"
}
PROMPT_COMMAND=set_prompt

#===============================
# NVM
#===============================
export NVM_DIR="$HOME/.nvm"
. "/usr/local/opt/nvm/nvm.sh"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

#===============================
# GPG
#===============================
export GPG_TTY=$(tty)

#===============================
# Setup Environment
#===============================
source ~/.profile
