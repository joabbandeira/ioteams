import React from 'react'
import { createRoot } from 'react-dom/client'
import { DemoApp } from './demo'
import { PanelApp } from './panel'
declare const __IOTEAMS_DEMO__: boolean
createRoot(document.getElementById('root')!).render(__IOTEAMS_DEMO__ || location.pathname === '/demo' ? <DemoApp/> : <PanelApp/>)
