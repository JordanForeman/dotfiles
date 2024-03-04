mkdir -p ./ext

if [ ! -d "./ext/zsh-autocomplete" ] ; then
  git clone --depth 1 -- https://github.com/marlonrichert/zsh-autocomplete.git ./ext/zsh-autocomplete
fi
write_to_file "source "$(pwd)"/ext/zsh-autocomplete/zsh-autocomplete.plugin.zsh" ~/.profile
