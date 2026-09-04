export interface SearchAuthorizationContext {
  tenantId: string;
  userId: string;
  membershipId?: string;
  roles?: string[];
  permissions?: string[];
  organizationScope?: string;
  branchScope?: string;
  departmentScope?: string;
  teamScope?: string;
  explicitDenials?: string[];
}
