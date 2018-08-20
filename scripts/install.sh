# Install dotfiles!
echo Installing bash profile
cp ../.bash_profile ~/.bash_profile
echo Installing TMUX config
cp ../.tmux.conf ~/.tmux.conf
echo Installing vim config
cp ../.vimrc ~/.vimrc
echo Installing vim plugins
cp -r ../.vim ~/.vim

