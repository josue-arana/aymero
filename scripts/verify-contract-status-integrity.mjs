import assert from 'node:assert/strict'
import { deriveProjectStatus, isProjectContractSigned, PROJECT_LIFECYCLE_STATUS } from '../src/utils/projectLifecycle.js'
import { getContractForProject } from '../src/utils/projectIdentity.js'

const projectWithoutContract = { id: 'project-draft', status: 'contract', title: 'Shared title' }

assert.equal(
  deriveProjectStatus({ project: projectWithoutContract }),
  PROJECT_LIFECYCLE_STATUS.CONTRACT_DRAFT,
  'legacy contract-stage project status must not imply a signed Contract'
)
assert.equal(
  deriveProjectStatus({ project: { ...projectWithoutContract, status: 'Signed' } }),
  PROJECT_LIFECYCLE_STATUS.CONTRACT_DRAFT,
  'stored Signed project status must not imply a signed Contract without a Contract record'
)
assert.equal(
  deriveProjectStatus({ project: { id: 'project-scheduled', status: 'Scheduled' } }),
  PROJECT_LIFECYCLE_STATUS.SCHEDULED,
  'projects without a Contract retain their project lifecycle status'
)

const draftContract = { id: 'contract-draft', projectId: 'project-draft', status: 'Draft' }
const sentContract = { id: 'contract-sent', projectId: 'project-sent', status: 'Sent' }
const signedContract = { id: 'contract-signed', projectId: 'project-signed', status: 'Signed', signedAt: '2026-10-17T12:00:00Z' }

assert.equal(deriveProjectStatus({ project: projectWithoutContract, contract: draftContract }), PROJECT_LIFECYCLE_STATUS.CONTRACT_DRAFT)
assert.equal(deriveProjectStatus({ project: { id: 'project-sent', status: 'Scheduled' }, contract: sentContract }), PROJECT_LIFECYCLE_STATUS.CONTRACT_DRAFT)
assert.equal(deriveProjectStatus({ project: { id: 'project-signed', status: 'Scheduled' }, contract: signedContract }), PROJECT_LIFECYCLE_STATUS.SIGNED)
assert.equal(isProjectContractSigned(signedContract), true)
assert.equal(isProjectContractSigned(draftContract), false)
assert.equal(isProjectContractSigned({ ...signedContract, status: 'Draft', signedAt: null }), false)

const duplicateTitleContracts = [
  { id: 'contract-other', projectId: 'project-other', title: 'Shared title', clientId: 'client-1', status: 'Signed' },
  { id: 'contract-draft', projectId: 'project-draft', title: 'Shared title', clientId: 'client-1', status: 'Draft' },
]
assert.equal(
  getContractForProject({ id: 'project-draft', title: 'Shared title', clientId: 'client-1' }, duplicateTitleContracts)?.id,
  'contract-draft',
  'Client Detail must resolve Contracts by canonical project ID, not duplicate titles'
)
assert.equal(
  getContractForProject({ id: 'project-missing', title: 'Shared title', clientId: 'client-1' }, duplicateTitleContracts),
  null,
  'unrelated Contracts must not be inferred from title or client'
)
assert.equal(
  getContractForProject({ id: 'project-draft', title: 'Shared title' }, [
    { id: 'contract-legacy', leadId: 'project-draft', title: 'Shared title', status: 'Draft' },
  ])?.id,
  'contract-legacy',
  'legacy lead-linked Contract fallback remains ID-based'
)

console.log('Contract status integrity validation passed.')
