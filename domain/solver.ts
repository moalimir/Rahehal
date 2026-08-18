export type SolverSpace = "individual" | "team";

export type SolverUser = {
  id: string;
  displayName: string;
  email: string;
  mobile?: string;
  avatar?: string;
  headline?: string;
};

export type PersonalWorkspace = {
  id: string;
  type: "individual";
  ownerUserId: string;
  name: string;
};

export type TeamRole = "owner" | "admin" | "proposal-manager" | "contributor" | "viewer";
export type TeamType = "expert-team" | "lab" | "academic-group" | "company";

export type TeamPolicy = {
  proposalManagersCanEditProfile: boolean;
  proposalManagersCanInvite: boolean;
  adminsCanSubmit: boolean;
  proposalManagersCanSubmit: boolean;
  viewersCanReadMessages: boolean;
  adminsCanViewPayments: boolean;
  proposalManagersCanViewPayments: boolean;
  approvalBeforeSubmit: boolean;
};

export type SolverTeam = {
  id: string;
  type: "team";
  workspaceId: string;
  name: string;
  teamType: TeamType;
  status: "draft" | "active" | "archived";
  ownerUserId: string;
  profileId: string;
  policyId: string;
  policy: TeamPolicy;
  createdAt: string;
};

export type MembershipState =
  | "invited"
  | "requested"
  | "active"
  | "rejected"
  | "expired"
  | "suspended"
  | "removed";

export type TeamMembership = {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
  state: MembershipState;
  assignedProposalIds: string[];
  assignedCaseIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ActiveWorkspace =
  | { type: "individual"; workspaceId: string }
  | { type: "team"; workspaceId: string; teamId: string; membershipId: string };

export type SolverSessionContext = {
  userId: string;
  activeWorkspace: ActiveWorkspace;
  expiresAt: number;
  version: 2;
};

export type TeamInvitationState =
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired"
  | "revoked";

export type TeamInvitation = {
  id: string;
  teamId: string;
  inviterUserId: string;
  recipientUserId?: string;
  recipientEmail: string;
  proposedRole: TeamRole;
  scope: string;
  message: string;
  commitment: string;
  ipNotice: string;
  relatedEntityId?: string;
  decisionReason?: string;
  state: TeamInvitationState;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type MembershipRequestState = "requested" | "accepted" | "rejected" | "withdrawn" | "expired";
export type MembershipRequest = {
  id: string;
  teamId: string;
  requesterUserId: string;
  requestedRole: Exclude<TeamRole, "owner">;
  introduction: string;
  resumeFileName: string;
  availability: string;
  state: MembershipRequestState;
  createdAt: string;
  updatedAt: string;
};

export type ProfileVisibility = "public" | "members" | "private";
export type PersonalProfile = {
  id: string;
  kind: "individual";
  workspaceId: string;
  displayName: string;
  headline: string;
  bio: string;
  skills: string[];
  experiences: string[];
  education: string[];
  projects: string[];
  availability: string;
  collaborationMode: string;
  resumeFileName?: string;
  visibility: ProfileVisibility;
  updatedAt: string;
};

export type TeamProfile = {
  id: string;
  kind: "team";
  workspaceId: string;
  teamId: string;
  name: string;
  introduction: string;
  valueProposition: string;
  expertise: string[];
  industries: string[];
  technologies: string[];
  foundedYear?: number;
  capacity: string;
  availability: string;
  caseStudies: string[];
  facilities: string[];
  collaborationMode: string;
  publicContact: string;
  visibility: ProfileVisibility;
  updatedAt: string;
};

export type ProposalState =
  | "draft"
  | "submitted"
  | "eligibility_review"
  | "eligible"
  | "ineligible"
  | "clarification_requested"
  | "clarification_submitted"
  | "reviewing"
  | "revision_requested"
  | "revision_draft"
  | "resubmitted"
  | "selected"
  | "rejected"
  | "withdrawn";

export type ProposalContent = {
  title: string;
  problemStatement: string;
  valueProposition: string;
  maturityLevel: string;
  prototypeWeeks: string;
  technologies: string[];
  technicalApproach: string;
  architecture: string;
  dataNeeds: string;
  successMetrics: string;
  ipStatus: string;
  durationWeeks: string;
  roadmap: string;
  dependencies: string;
  pilotLocation: string;
  risks: string;
  mitigation: string;
  leadName: string;
  teamSummary: string;
  relevantExperience: string;
  requestedBudget: string;
  paymentModel: string;
  budgetRationale: string;
  startAvailability: string;
  teamAvailability: string;
  ndaAccepted: boolean;
  conflictDeclared: boolean;
  ipAccepted: boolean;
  accuracyConfirmed: boolean;
  attachmentNames: string[];
};

export type ProposalVersion = {
  id: string;
  proposalId: string;
  number: number;
  actorUserId: string;
  createdAt: string;
  content: ProposalContent;
  changedFields: Array<keyof ProposalContent>;
  locked: boolean;
};

export type Proposal = {
  id: string;
  challengeId: string;
  ownerWorkspaceId: string;
  currentVersionId: string;
  state: ProposalState;
  assignedMembershipIds: string[];
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  trackingCode?: string;
};

export type ProposalDraft = {
  id: string;
  challengeId: string;
  ownerWorkspaceId: string;
  baseProposalId?: string;
  revisionOfVersionId?: string;
  content: ProposalContent;
  version: number;
  updatedAt: string;
};

export type DirectOfferState =
  | "received"
  | "viewed"
  | "response_draft"
  | "response_submitted"
  | "negotiating"
  | "selected"
  | "declined"
  | "expired"
  | "cancelled";

export type DirectOffer = {
  id: string;
  challengeId: string;
  senderOrganizationId: string;
  recipientWorkspaceId: string;
  title: string;
  summary: string;
  invitationReasons: string[];
  requestedDocuments: string[];
  deadline: string;
  state: DirectOfferState;
  viewedAt?: string;
  declinedAt?: string;
  declineReason?: string;
  updatedAt: string;
};

export type OfferResponse = {
  id: string;
  offerId: string;
  ownerWorkspaceId: string;
  version: number;
  state: "draft" | "submitted";
  approach: string;
  budget: string;
  duration: string;
  attachmentNames: string[];
  submittedAt?: string;
  trackingCode?: string;
  updatedAt: string;
};

export type SolverNotificationType =
  | "team_invitation"
  | "invitation_response"
  | "membership_request"
  | "role_changed"
  | "direct_offer"
  | "deadline"
  | "proposal_submitted"
  | "proposal_revision"
  | "proposal_decision"
  | "message"
  | "deliverable"
  | "payment";

export type SolverNotification = {
  id: string;
  recipientUserId: string;
  recipientWorkspaceId: string;
  type: SolverNotificationType;
  title: string;
  body: string;
  entityId: string;
  deepLink: string;
  readAt?: string;
  createdAt: string;
  priority: "normal" | "high";
  actionRequired: boolean;
};

export type VerificationState =
  | "not_started"
  | "draft"
  | "submitted"
  | "under_review"
  | "verified"
  | "needs_revision"
  | "rejected"
  | "expired";

export type VerificationRecord = {
  id: string;
  subjectType: "user" | "team";
  subjectId: string;
  workspaceId: string;
  state: VerificationState;
  documents: Array<{ id: string; label: string; fileName?: string; state: VerificationState; reason?: string }>;
  submittedAt?: string;
  updatedAt: string;
};

export type NdaAcceptance = {
  id: string;
  workspaceId: string;
  entityId: string;
  version: string;
  actorUserId: string;
  acceptedAt: string;
  expiresAt: string;
  state: "active" | "revoked" | "expired";
};

export type ContractState = "draft" | "negotiation" | "approval" | "signature" | "effective" | "rejected" | "superseded";
export type SolverContract = {
  id: string;
  caseId: string;
  proposalId: string;
  proposalVersionId: string;
  ownerWorkspaceId: string;
  version: number;
  state: ContractState;
  scope: string;
  deliverables: string[];
  amount: number;
  milestones: string[];
  ipTerms: string;
  confidentiality: string;
  approvals: Array<{ version: number; actorUserId: string; approvedAt: string }>;
  signedAt?: string;
  effectiveAt?: string;
  updatedAt: string;
};

export type CaseRecord = {
  id: string;
  proposalId: string;
  ownerWorkspaceId: string;
  contractId: string;
  state: "active" | "paused" | "completed" | "closed" | "cancelled";
  messages: Array<{ id: string; actorUserId: string; body: string; createdAt: string; readAt?: string }>;
  pilot: { id: string; state: "planned" | "active" | "paused" | "completed" | "cancelled"; tasks: Array<{ id: string; title: string; ownerId: string; done: boolean }> };
  deliverables: Array<{ id: string; title: string; state: "draft" | "submitted" | "revision" | "accepted" | "rejected"; fileName?: string; updatedAt: string }>;
  payments: Array<{ id: string; milestone: string; amount: number; state: "triggered" | "approval" | "processing" | "paid" | "hold" | "failed"; receiptId?: string }>;
  feedback?: { id: string; actorUserId: string; outcome: string; comment: string; createdAt: string };
  closedAt?: string;
};

export type AccountSettings = {
  mobile: string;
  timezone: string;
  emailNotifications: boolean;
  smsNotifications: boolean;
  profileVisibility: ProfileVisibility;
  defaultWorkspaceId: string;
  recoveryEmail: string;
  sessions: Array<{
    id: string;
    device: string;
    lastActiveAt: string;
    current: boolean;
    revokedAt?: string;
  }>;
};

export type TeamSettings = {
  teamId: string;
  publicContact: string;
  visibility: ProfileVisibility;
  membershipPolicy: "open" | "request" | "invite-only";
  defaultInviteRole: Exclude<TeamRole, "owner">;
  notificationPolicy: "all-admins" | "owner" | "assigned";
  policy: TeamPolicy;
};

export type SolverAuditEvent = {
  id: string;
  actorUserId: string;
  workspaceId: string;
  entityId: string;
  action: string;
  createdAt: string;
  receiptId: string;
};

export type SolverState = {
  version: 3;
  seededAt: string;
  updatedAt: string;
  currentUser: SolverUser;
  users: SolverUser[];
  personalWorkspace: PersonalWorkspace;
  teams: SolverTeam[];
  memberships: TeamMembership[];
  invitations: TeamInvitation[];
  membershipRequests: MembershipRequest[];
  personalProfiles: PersonalProfile[];
  teamProfiles: TeamProfile[];
  savedByWorkspace: Record<string, string[]>;
  proposals: Proposal[];
  proposalVersions: ProposalVersion[];
  proposalDrafts: ProposalDraft[];
  directOffers: DirectOffer[];
  offerResponses: OfferResponse[];
  notifications: SolverNotification[];
  verifications: VerificationRecord[];
  ndaAcceptances: NdaAcceptance[];
  contracts: SolverContract[];
  cases: CaseRecord[];
  accountSettings: AccountSettings;
  teamSettings: TeamSettings[];
  auditEvents: SolverAuditEvent[];
  idempotency: Record<string, { entityId: string; receiptId: string; createdAt: string }>;
};

export type MutationReceipt = {
  ok: true;
  entityId: string;
  receiptId: string;
  auditEventId: string;
  timestamp: string;
  idempotent: boolean;
};

export type MutationFailure = {
  ok: false;
  code: "NOT_FOUND" | "NO_ACCESS" | "INVALID_STATE" | "CONFLICT" | "VALIDATION" | "STORAGE";
  message: string;
};

export type MutationResult = MutationReceipt | MutationFailure;
