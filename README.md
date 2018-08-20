dotfiles
========

Config stuff

## Installation

First, clone this repository and cd into the scripts directory

```
$ git clone git@github.com:JordanForeman/dotfiles.git
$ cd dotfiles/scripts
```

Then, run the `install.sh` script to copy the dotfiles to their correct locations

```
$ chmod +x install.sh
$ . install.sh
```

If you ever want to update, just re-run `install.sh`

## Contributing

If you make modifications to your local copy, and want to copy them into a branch for merging, run the `update.sh` script

```
$ chmod +x scripts/update.sh
$ . scripts/update.sh
```

This will copy the existing copies of any dotfiles into your local repository. 

Then, create a branch and open a PR

