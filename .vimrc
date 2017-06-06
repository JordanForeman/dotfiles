" Install Pathogen
execute pathogen#infect()

" Tab Config
set expandtab
set tabstop=4
set softtabstop=4
set shiftwidth=4
set autoindent

" Fix Backspace
set backspace=indent,eol,start

" Color Scheme
syntax enable
colorscheme synthwave
highlight NonText ctermfg=LightGray

" Font settings
"set guifont=Consolas:h12
set guifont=Inconsolata:h14
"set guifont=DejaVu\ Sans\ Mono:h12

" Maximize window on startup
au GUIEnter * simalt ~x

" GUI Options
set guioptions-=m
set guioptions-=T
set guioptions-=r
set guioptions-=L

" Show Line Numbers
set number

" Show whitespace characters
set list
set listchars=eol:¬,nbsp:·,trail:·,tab:>-,precedes:·

" Highlight JSON as JavaScript
autocmd BufNewFile,BufRead *.json set ft=javascript

" Configure Line Endings
set ffs=unix,dos

" Configure ctrlp
let g:ctrlp_working_path_mode=0
let g:ctrlp_custom_ignore='node_modules\|DS_STORE\|git\|coverage\|lib'

" Configure SwapFile location
"set swapfile
"set dir=/tmp
set backup
set backupdir=C:\tmp
set backupskip=C:\tmp\*
set directory=C:\tmp
set writebackup

" Configure NerdTree
let NERDTreeShowHidden=1
let NERDTREEIgnore=['\node_modules']
map <F2> :NERDTreeToggle<CR>

" Configure vim-jsx
let g:jsx_ext_required=0

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" MULTIPURPOSE TAB KEY
" Indent if we're at the beginning of a line. Else, do completion.
" https://github.com/garybernhardt/dotfiles/blob/99b7d2537ad98dd7a9d3c82b8775f0de1718b356/.vimrc#L166-L180
""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
function! InsertTabWrapper()
    let col = col('.') - 1
    if !col || getline('.')[col - 1] !~ '\k'
        return "\<tab>"
    else
        return "\<c-p>"
    endif
endfunction
inoremap <expr> <tab> InsertTabWrapper()
inoremap <s-tab> <c-n>
