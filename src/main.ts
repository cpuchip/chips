import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'
import { connect } from './net.ts'

connect()

mount(App, { target: document.getElementById('app')! })
