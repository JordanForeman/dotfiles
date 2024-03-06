setup_opencommit() {
  echo "Please enter your OpenAI API key (leave blank to ignore):"
  read -t 30 api_key # Timeout safely after 30 seconds

  if [[ -n "$api_key" ]]; then
    ln -sf "$(pwd)/.opencommit" "$HOME/.opencommit"

    if [[ ! -f "$HOME/.opencommit" ]]; then
      touch "$HOME/.opencommit"
    fi

    echo "OCO_OPENAI_API_KEY=$api_key" >> "$HOME/.opencommit"
  fi
}

export -f setup_opencommit

setup_opencommit
