import { KNOWN_PORTALS } from '../config/portals';
import { buildFeatureAccess, sanitizeFeatureAccessClient } from '../config/features';

export function buildPortalsAccess(existing = {}) {
  const base = Object.fromEntries(KNOWN_PORTALS.map(({ key }) => [key, '']));
  return { ...base, ...existing };
}

export function buildPortalMappings(formData) {
  const portalMappings = {
    mentoring_app: { profileId: formData.mentorProfileId },
    assessment_app: { profileId: formData.assessmentProfileId },
    tyre_app: { profileId: formData.tyreProfileId },
    compliance_app: { profileId: formData.complianceProfileId },
  };

  const cpcRole = formData.portalsAccess?.cpc_app || '';
  if (cpcRole === 'driver' || cpcRole === 'trainer' || cpcRole === 'admin') {
    portalMappings.cpc_app = {
      qualifiesAsDriver: cpcRole === 'driver' ? true : Boolean(formData.cpcQualifiesAsDriver),
    };
  }

  return portalMappings;
}

export function getMentorProfileId(portalMappings = {}) {
  const value = portalMappings?.mentoring_app?.profileId;
  return typeof value === 'string' ? value : '';
}

export function getAssessmentProfileId(portalMappings = {}) {
  const value = portalMappings?.assessment_app?.profileId;
  return typeof value === 'string' ? value : '';
}

export function getTyreProfileId(portalMappings = {}) {
  const value = portalMappings?.tyre_app?.profileId;
  return typeof value === 'string' ? value : '';
}

export function getComplianceProfileId(portalMappings = {}) {
  const value = portalMappings?.compliance_app?.profileId;
  return typeof value === 'string' ? value : '';
}

export function toCompanyEmail(fullName = '') {
  const localPart = String(fullName).replace(/\s+/g, '').toLowerCase();
  return localPart ? `${localPart}@countrylion.co.uk` : '';
}

export function sortProfilesAtoZ(profiles = [], labelBuilder) {
  return [...profiles].sort((a, b) => {
    const aLabel = labelBuilder(a).toLowerCase();
    const bLabel = labelBuilder(b).toLowerCase();
    return aLabel.localeCompare(bLabel);
  });
}

export function portalAccessFromUser(user = {}) {
  return {
    email: user.email || '',
    businessCommsEmail: user.businessCommsEmail === 'personal' ? 'personal' : 'work',
    fullName: user.fullName || '',
    isActive: user.isActive ?? true,
    portalsAccess: buildPortalsAccess(user.portalsAccess || {}),
    featureAccess: buildFeatureAccess(user.featureAccess || {}),
    mentorProfileId: getMentorProfileId(user.portalMappings || {}),
    assessmentProfileId: getAssessmentProfileId(user.portalMappings || {}),
    tyreProfileId: getTyreProfileId(user.portalMappings || {}),
    complianceProfileId: getComplianceProfileId(user.portalMappings || {}),
    cpcQualifiesAsDriver: user.portalMappings?.cpc_app?.qualifiesAsDriver === true,
  };
}

export function canManagePortalAccess(user) {
  return user?.portalsAccess?.master_admin === 'admin';
}
