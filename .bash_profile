#===============================
# Vars
#===============================

txtblk='\e[0;30m' # Black - Color
txtred='\e[0;31m' # Red
txtgrn='\e[0;32m' # Green
txtylw='\e[0;33m' # Yellow
txtblu='\e[0;34m' # Blue
txtpur='\e[0;35m' # Purple
txtcyn='\e[0;36m' # Cyan
txtwht='\e[0;37m' # White

# Custom Colors
txtltgry='\e[0;90m' # Light Gray

bldblk='\e[1;30m' # Black - Bold
bldred='\e[1;31m' # Red
bldgrn='\e[1;32m' # Green
bldylw='\e[1;33m' # Yellow
bldblu='\e[1;34m' # Blue
bldpur='\e[1;35m' # Purple
bldcyn='\e[1;36m' # Cyan
bldwht='\e[1;37m' # White

unkblk='\e[4;30m' # Black - Underline
undred='\e[4;31m' # Red
undgrn='\e[4;32m' # Green
undylw='\e[4;33m' # Yellow
undblu='\e[4;34m' # Blue
undpur='\e[4;35m' # Purple
undcyn='\e[4;36m' # Cyan
undwht='\e[4;37m' # White

bakblk='\e[40m'   # Black - Background
bakred='\e[41m'   # Red
badgrn='\e[42m'   # Green
bakylw='\e[43m'   # Yellow
bakblu='\e[44m'   # Blue
bakpur='\e[45m'   # Purple
bakcyn='\e[46m'   # Cyan
bakwht='\e[47m'   # White

txtrst='\e[0m'    # Text Reset

#===============================
# Default Path
#===============================

PATH=/Users/$(whoami)/bin:/Users/$(whoami)/sbin:$PATH
PATH=/usr/bin:/usr/sbin:/usr/local:/bin:/sbin:$PATH
PATH=/opt/local/bin:/opt/local/sbin:$PATH
PATH=/usr/local/mysql/bin:$PATH

#===============================
# Custom Packages
#===============================

export PATH

[[ -s "$HOME/.rvm/scripts/rvm" ]] && source "$HOME/.rvm/scripts/rvm" # Load RVM into a shell session *as a function*

#===============================
#===============================

# Terminal Settings
export CLICOLOR=1
export LSCOLORS=ExFxBxDxCxegedabagacad
alias ls='ls -GFh'

# Custom Functions
function parse_git_branch() {
    git branch 2> /dev/null | sed -e '/^[^*]/d' -e 's/* \(.*\)/ (\1)/'
}

# Configure Prompt
set_prompt() {
    PS1="$bakblk"     # Background Color
    PS1=$PS1"\n" 	  # New Line
    PS1=$PS1"$txtgrn"
    PS1=$PS1"👨‍💻 " # User Details (green)
    PS1=$PS1"$txtylw""\w" # PWD
    PS1=$PS1"$txtcyn""$(parse_git_branch)" # Git branch
    PS1=$PS1"\n" # New Line
    PS1=$PS1"$txtwht"$'⚡ '
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
# Custom Aliases
#===============================
alias cls='clear' # Old habits die hard
