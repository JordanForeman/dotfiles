#!/bin/zsh

extensions=(
  aaronthomas.vscode-snazzy-operator
  github.copilot
  github.copilot-chat
  github.heygithub
  johnpapa.vscode-peacock
  kaiwood.endwise
  koichisasada.vscode-rdbg
  pkief.material-icon-theme
  shopify.ruby-extensions-pack
  shopify.ruby-lsp
  sorbet.sorbet-vscode-extension
  yoavbls.pretty-ts-errors
  ms-vscode.vscode-speech
  github.vscode-pull-request-github
  adpyke.codesnap
)

for extension in "${extensions[@]}"; do
  echo "Installing $extension"
  code --install-extension "$extension"
done
