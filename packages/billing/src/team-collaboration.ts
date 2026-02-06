export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export interface TeamMember {
  id: string;
  userId: string;
  workspaceId: string;
  role: UserRole;
  permissions: Permission[];
  joinedAt: Date;
}

export enum Permission {
  // Test permissions
  TEST_CREATE = 'test:create',
  TEST_READ = 'test:read',
  TEST_UPDATE = 'test:update',
  TEST_DELETE = 'test:delete',
  TEST_EXECUTE = 'test:execute',

  // Project permissions
  PROJECT_CREATE = 'project:create',
  PROJECT_READ = 'project:read',
  PROJECT_UPDATE = 'project:update',
  PROJECT_DELETE = 'project:delete',

  // Team permissions
  TEAM_INVITE = 'team:invite',
  TEAM_REMOVE = 'team:remove',
  TEAM_MANAGE_ROLES = 'team:manage_roles',

  // Billing permissions
  BILLING_VIEW = 'billing:view',
  BILLING_MANAGE = 'billing:manage',
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  members: TeamMember[];
  createdAt: Date;
  updatedAt: Date;
}

export class TeamCollaborationManager {
  private static ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
    [UserRole.OWNER]: Object.values(Permission),
    [UserRole.ADMIN]: [
      Permission.TEST_CREATE,
      Permission.TEST_READ,
      Permission.TEST_UPDATE,
      Permission.TEST_DELETE,
      Permission.TEST_EXECUTE,
      Permission.PROJECT_CREATE,
      Permission.PROJECT_READ,
      Permission.PROJECT_UPDATE,
      Permission.PROJECT_DELETE,
      Permission.TEAM_INVITE,
      Permission.TEAM_REMOVE,
      Permission.BILLING_VIEW,
    ],
    [UserRole.MEMBER]: [
      Permission.TEST_CREATE,
      Permission.TEST_READ,
      Permission.TEST_UPDATE,
      Permission.TEST_EXECUTE,
      Permission.PROJECT_READ,
      Permission.PROJECT_UPDATE,
    ],
    [UserRole.VIEWER]: [
      Permission.TEST_READ,
      Permission.PROJECT_READ,
    ],
  };

  /**
   * Create workspace
   */
  async createWorkspace(name: string, ownerId: string): Promise<Workspace> {
    const workspace: Workspace = {
      id: this.generateId(),
      name,
      ownerId,
      members: [
        {
          id: this.generateId(),
          userId: ownerId,
          workspaceId: '',
          role: UserRole.OWNER,
          permissions: TeamCollaborationManager.ROLE_PERMISSIONS[UserRole.OWNER],
          joinedAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    workspace.members[0].workspaceId = workspace.id;
    return workspace;
  }

  /**
   * Invite member to workspace
   */
  async inviteMember(workspaceId: string, userId: string, role: UserRole): Promise<TeamMember> {
    const member: TeamMember = {
      id: this.generateId(),
      userId,
      workspaceId,
      role,
      permissions: TeamCollaborationManager.ROLE_PERMISSIONS[role],
      joinedAt: new Date(),
    };

    return member;
  }

  /**
   * Update member role
   */
  async updateMemberRole(memberId: string, newRole: UserRole): Promise<TeamMember> {
    // Mock implementation
    const member: TeamMember = {
      id: memberId,
      userId: 'user-123',
      workspaceId: 'workspace-123',
      role: newRole,
      permissions: TeamCollaborationManager.ROLE_PERMISSIONS[newRole],
      joinedAt: new Date(),
    };

    return member;
  }

  /**
   * Remove member from workspace
   */
  async removeMember(workspaceId: string, memberId: string): Promise<void> {
    // Mock implementation
  }

  /**
   * Check if user has permission
   */
  hasPermission(member: TeamMember, permission: Permission): boolean {
    return member.permissions.includes(permission);
  }

  /**
   * Check if user can perform action
   */
  canPerformAction(member: TeamMember, action: string): boolean {
    const permissionMap: Record<string, Permission> = {
      'create_test': Permission.TEST_CREATE,
      'update_test': Permission.TEST_UPDATE,
      'delete_test': Permission.TEST_DELETE,
      'execute_test': Permission.TEST_EXECUTE,
      'invite_member': Permission.TEAM_INVITE,
      'remove_member': Permission.TEAM_REMOVE,
      'manage_billing': Permission.BILLING_MANAGE,
    };

    const requiredPermission = permissionMap[action];
    return requiredPermission ? this.hasPermission(member, requiredPermission) : false;
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
