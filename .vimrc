" Tab Config
set expandtab
set tabstop=4
set softtabstop=4
set shiftwidth=4
set autoindent

" Fix Backspace
set backspace=indent,eol,start

" Mouse Scroll
set mouse=a

" Color Scheme
syntax enable
colorscheme snazzy
highlight NonText ctermfg=LightGray
highlight Normal ctermfg=LightGray ctermbg=235
highlight TabLineFill ctermfg=255 ctermbg=61
highlight TabLineSel ctermfg=255 ctermbg=65
highlight TabLine ctermfg=255 ctermbg=61

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
set backup
set backupdir=/tmp
set backupskip=/tmp/*
set directory=/tmp
set writebackup

" Configure NerdTree
let NERDTreeShowHidden=1
let NERDTREEIgnore=['\node_modules']
map <F2> :NERDTreeToggle<CR>

" Configure vim-jsx
let g:jsx_ext_required=0

" Custom Keymapping
imap <Leader>af () => {}<Left><Enter><Enter><Up><Tab>
imap <Leader>it it('', );<Left><Left><Leader>af<Up>
imap <Leader>des describe('', );<Left><Left><Leader>af<Up><Right><Right><Right><Right><Right><Right>

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
