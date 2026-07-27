import { ClientSession, ObjectId } from 'mongodb';

export interface IPlivoAgentCredential {
  _id?: string | ObjectId;
  agentNumber: string; // e.g. "agent_1", "agent_2", "agent_3", etc.
  username: string;    // Plivo Endpoint SIP Username (e.g. "agent1annam65584062554809138381")
  sipUri?: string;     // Plivo Endpoint SIP URI (e.g. "sip:agent1annam65584062554809138381@phone.plivo.com")
  password: string;    // Plivo Endpoint SIP Password
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPlivoCredentialsRepository {
  findByAgentNumber(agentNumber: string, session?: ClientSession): Promise<IPlivoAgentCredential | null>;
  upsertAgentCredential(agentNumber: string, username: string, password: string, session?: ClientSession): Promise<IPlivoAgentCredential>;
  getAllAgentCredentials(session?: ClientSession): Promise<IPlivoAgentCredential[]>;
}
