#===============================
# Vars
#===============================

bldblk='\e[1;30m' # Black - Bold
txtgrn='\e[0;32m' # Green
txtylw='\e[0;33m' # Yellow
txtwht='\e[0;37m' # White
txtcyn='\e[0;36m' # Cyan

#===============================
# Default Path
#===============================

PATH=/Users/$(whoami)/bin:/Users/$(whoami)/sbin:$PATH
PATH=/usr/bin:/usr/sbin:/usr/local:/bin:/sbin:$PATH
PATH=/opt/local/bin:/opt/local/sbin:$PATH
PATH=/usr/local/mysql/bin:$PATH

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
    BRANCH_NAME=$(git branch | grep \* | cut -d ' ' -f2)
    CHANGED=$(git status --porcelain)

    if [ -n "${CHANGED}" ]; then
        echo "$BRANCH_NAME*";
    else
        echo "$BRANCH_NAME";
    fi
}

function parse_npm_version() {
    if test -f package.json; then
        PACKAGE_VERSION=$(node -pe "require('./package.json').version")
        echo "📦 $PACKAGE_VERSION"
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
    PS1=$PS1"$txtcyn"" $(parse_git_branch)" # Git branch
    PS1=$PS1"$txtgrn"" $(parse_npm_version)" # NPM Package
    PS1=$PS1"\n" # New Line
    PS1=$PS1"$txtwht""> "
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
export GPG_TTY=$(tty)¬
