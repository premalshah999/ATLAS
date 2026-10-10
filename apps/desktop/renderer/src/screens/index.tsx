import React from 'react';
import type { ScreenId } from '../lib/store';
import { MissionControl } from './mission';
import { Welcome, Home, Workspaces, MissionCreate } from './start';
import { AgentDetail, GraphScreen, AgentStudio } from './agent';
import { TerminalWorkspace, Review, Computer } from './tools';
import { Deploy, Settings, Report, ActivityScreen } from './ops';

export const screens: Record<ScreenId, React.ComponentType> = {
  welcome: Welcome, home: Home, workspaces: Workspaces, create: MissionCreate, mission: MissionControl, graph: GraphScreen,
  agent: AgentDetail, terminal: TerminalWorkspace, review: Review, computer: Computer, deploy: Deploy, studio: AgentStudio,
  settings: Settings, report: Report, activity: ActivityScreen,
};
