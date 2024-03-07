#!/bin/bash

# Check if asdf is installed
if command -v asdf &> /dev/null; then
  # Install asdf Ruby plugin
  asdf plugin-add ruby https://github.com/asdf-vm/asdf-ruby.git

  # Install asdf Node.js plugin
  asdf plugin-add nodejs https://github.com/asdf-vm/asdf-nodejs.git

  # Install Ruby and Node.js versions using asdf
  asdf install ruby 3.3.0
  asdf install nodejs lts/fermium
fi
