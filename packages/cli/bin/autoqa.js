#!/usr/bin/env node

const { program } = require('commander')
const updateNotifier = require('update-notifier')
const pkg = require('../package.json')

// Check for updates
const notifier = updateNotifier({ pkg })
notifier.notify()

// Import and run CLI
require('../dist/index.js')