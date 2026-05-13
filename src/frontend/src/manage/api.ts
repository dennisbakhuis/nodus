/**
 * Back-compat re-export shim. Preserves the legacy ``manage/api.ts`` import
 * paths for files that haven't been migrated to the per-resource modules
 * under ``../api/`` yet.
 */

export type { TopicListParams } from "../api/topics";
export {
  addAlias,
  createFactsheet,
  createTopic,
  getFactsheetVersion,
  listFactsheets,
  listMovements,
  listTopics,
  removeAlias,
  updateTechnology,
  updateTopic,
} from "../api/topics";

export {
  createSegment,
  deleteSegment,
  listSegments,
  reorderSegments,
  updateSegment,
} from "../api/segments";

export {
  addPersonToTopic,
  createPerson,
  deletePerson,
  listPersons,
  listTopicPersons,
  removePersonFromTopic,
  updatePerson,
  upsertPersonOnTopic,
} from "../api/persons";

export type { PartyRead } from "../api/parties";
export { createParty, listParties } from "../api/parties";

export {
  addUrlToPeerReference,
  createPeerReference,
  deletePeerReference,
  listPeerReferences,
  removeUrlFromPeerReference,
  updatePeerReference,
} from "../api/peer-references";

export {
  closeCycle,
  createCycle,
  getDeliverable,
  listCycles,
  updateCycle,
} from "../api/cycles";

export type {
  UserAdminCreatePayload,
  UserAdminRead,
  UserAdminUpdatePayload,
} from "../api/users";
export {
  createUser,
  deactivateUser,
  listUsers,
  resetUserPassword,
  updateUser,
} from "../api/users";

export type { SettingRead } from "../api/settings";
export { getSetting, listSettings, upsertSetting } from "../api/settings";

export type { VisibilityConfig } from "../api/visibility";
export { getVisibilityConfig, saveVisibilityConfig } from "../api/visibility";

export { getMediaUrl, uploadMedia } from "../api/media";

export type {
  BackupConflict,
  BackupInspectionReport,
  BackupRestoreResult,
  DownloadProgress,
} from "../api/backup";
export { downloadBackup, inspectBackup, restoreBackup } from "../api/backup";
