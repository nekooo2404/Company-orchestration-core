import { type IncomingMessage, type Server } from 'node:http';
import { type ActorRef } from '@aicompany/contracts';
import type { ControlPlaneService } from './service.js';
import { type ModelEndpointStore } from './model-endpoints.js';
import { type AgentProfileStore } from './agent-profiles.js';
import { type AgentChatStore } from './chat.js';
export declare const parseActor: (request: IncomingMessage) => ActorRef;
export declare const createControlPlaneServer: (service: ControlPlaneService, modelEndpoints?: ModelEndpointStore, agents?: AgentProfileStore, chats?: AgentChatStore, accessGrantFile?: string | null, hookToken?: string | null) => Server;
//# sourceMappingURL=http.d.ts.map