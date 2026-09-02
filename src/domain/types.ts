/**
 * ชนิดข้อมูลหลักของระบบสนับสนุนการผสมเทียมโคขุน สหกรณ์วังชิ้น
 * อ้างอิง ER diagram และแคตตาล็อกกิจกรรมในเอกสารโครงการ
 */

/**
 * บทบาทผู้ใช้ — มีเท่าที่ทำงานจริงตามแคตตาล็อกกิจกรรม
 *
 * คณะกรรมการกับผู้ดูแลระบบไม่ใช่บทบาทการทำงาน เพราะกรรมการทำกิจกรรมเดียว
 * (ง-01 และทำร่วมกับสหกรณ์อยู่แล้ว) ส่วนผู้ดูแลระบบไม่มีกิจกรรมของตัวเองเลย
 * ทั้งสองจึงเป็น "ระดับสิทธิ์" ที่แปะบนบัญชีแทน ดู readOnly / isAdmin ด้านล่าง
 *
 * ใช้คำว่า "สัตวบาล" ตามแคตตาล็อกกิจกรรม (requirement ข้อ 8 เขียนว่าสัตวแพทย์
 * แต่คนที่ออกหน่วยจริงคือสัตวบาล ส่วนสัตวแพทย์เข้ามาเป็นครั้งคราว)
 */
export type Role = 'farmer' | 'husbandry' | 'coop'

export const ROLE_LABEL: Record<Role, string> = {
  farmer: 'เกษตรกร',
  husbandry: 'สัตวบาล',
  coop: 'เจ้าหน้าที่สหกรณ์',
}

export interface User {
  id: string
  name: string
  role: Role
  phone: string
  farmIds: string[]
  /** ดูได้อย่างเดียว บันทึกหรือแก้ไขไม่ได้ — ใช้กับคณะกรรมการสหกรณ์ */
  readOnly: boolean
  /** เข้าถึงการตั้งค่าระบบและเครื่องมือผู้ดูแลได้ */
  isAdmin: boolean
  active: boolean
}

export interface Farm {
  id: string
  code: string
  name: string
  owner: string
  phone: string
  village: string
  subdistrict: string
  district: string
  province: string
  lat: number
  lng: number
  active: boolean
}

/** ระยะของวงจรการสืบพันธุ์ ใช้กำหนดว่าโคตัวนั้นควรถูกทำอะไรต่อ */
export type CycleStage =
  | 'heifer' // โคสาว ยังไม่เคยให้ลูก
  | 'fresh' // หลังคลอด อยู่ในระยะพัก
  | 'waiting' // พร้อมเข้าโปรแกรมผสม
  | 'bred' // ผสมแล้ว รอตรวจครรภ์
  | 'pregnant' // ยืนยันตั้งท้อง
  | 'dry' // พักก่อนคลอด
  | 'problem' // มีปัญหา ต้องฟื้นฟูก่อน
  | 'culled' // คัดออก

export const CYCLE_LABEL: Record<CycleStage, string> = {
  heifer: 'โคสาว',
  fresh: 'หลังคลอด',
  waiting: 'พร้อมผสม',
  bred: 'ผสมแล้ว รอตรวจ',
  pregnant: 'ตั้งท้อง',
  dry: 'พักก่อนคลอด',
  problem: 'ต้องฟื้นฟู',
  culled: 'คัดออก',
}

export interface Animal {
  id: string
  rfid: string
  tagNo: string
  name: string
  sex: 'female' | 'male'
  breed: string
  bloodPct: number
  birthDate: number
  farmId: string
  damId: string | null
  sireCode: string | null
  stage: CycleStage
  parity: number
  lastCalvingAt: number | null
  lastHeatAt: number | null
  lastBredAt: number | null
  expectedCalvingAt: number | null
  lastBcs: number | null
  feedGroupId: string | null
  withdrawalUntil: number | null
  active: boolean
}

/** ล็อตน้ำเชื้อ */
export interface SemenBatch {
  id: string
  lotNo: string
  sireCode: string
  sireName: string
  breed: string
  bloodPct: number
  collectedAt: number
  expiresAt: number
  tankId: string
  canister: string
  strawsIn: number
  strawsUsed: number
  motilityCert: number
  motilityLast: number | null
  lastQcAt: number | null
  nextQcAt: number | null
  status: 'ok' | 'watch' | 'rejected' | 'expired'
}

/** ถังไนโตรเจนเหลว */
export interface Tank {
  id: string
  code: string
  location: string
  capacityL: number
  levelCm: number
  lastFilledAt: number
  lastCheckAt: number
  evaporationCmPerWeek: number
  status: 'ok' | 'watch' | 'critical'
}

/** กลุ่มโคและสูตรอาหาร */
export interface FeedGroup {
  id: string
  name: string
  formula: string
  kgPerHeadPerDay: number
  supplements: string
  startedAt: number
}

/** วัตถุดิบอาหารสัตว์ที่สุ่มตรวจ */
export interface FeedLot {
  id: string
  lotNo: string
  material: string
  supplier: string
  receivedAt: number
  moisturePct: number | null
  aflatoxinPpb: number | null
  verdict: 'pass' | 'hold' | 'reject' | null
}

/** สถานะการซิงค์ตาม requirement ข้อ 4 */
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed'

export const SYNC_LABEL: Record<SyncStatus, string> = {
  pending: 'รอซิงค์',
  syncing: 'กำลังซิงค์',
  synced: 'ซิงค์แล้ว',
  conflict: 'ขัดแย้ง',
  failed: 'ล้มเหลว',
}

/**
 * บันทึกกิจกรรมหนึ่งครั้ง — ทุกกิจกรรมในแคตตาล็อกลงตารางเดียวกันหมด
 * โดยแยกกันด้วย activityCode และเก็บค่าที่กรอกไว้ใน payload
 */
export interface ActivityRecord {
  id?: number
  localId: string
  serverId: string | null
  activityCode: string
  animalId: string | null
  farmId: string | null
  occurredAt: number
  payload: Record<string, unknown>
  photoIds: number[]
  note: string
  recordedBy: string
  recordedRole: Role
  lastModified: number
  syncStatus: SyncStatus
  retries: number
  /** ใช้ตอนแก้ไขความขัดแย้ง เก็บค่าที่เซิร์ฟเวอร์ส่งกลับมา */
  serverPayload?: Record<string, unknown> | null
}

/** รูปที่แนบกับบันทึก เก็บเป็น blob แยกเพื่อให้ส่งเป็น batch ตอนซิงค์ได้ */
export interface Photo {
  id?: number
  localId: string
  recordLocalId: string | null
  blob: Blob
  bytes: number
  width: number
  height: number
  at: number
  syncStatus: SyncStatus
}

/** งานที่ระบบคำนวณล่วงหน้า (ค-01, ค-02) */
export type TaskStatus = 'open' | 'done' | 'skipped' | 'overdue' | 'escalated'

export interface Task {
  id?: number
  localId: string
  activityCode: string
  animalId: string | null
  farmId: string | null
  title: string
  dueAt: number
  toleranceDays: number
  assignedRole: Role
  assignedTo: string | null
  priority: 'low' | 'normal' | 'high'
  status: TaskStatus
  /** ที่มาของกำหนดการ เช่น "คลอด 12 ก.ค. + 30 วัน" ตาม ค-01 */
  derivedFrom: string
  doneAt: number | null
  doneRecordLocalId: string | null
}

/** การแจ้งเตือน (ค-03) พร้อมการติดตามผลตอบสนอง */
export interface Alert {
  id?: number
  localId: string
  taskLocalId: string | null
  animalId: string | null
  farmId: string | null
  title: string
  body: string
  level: 'info' | 'warn' | 'critical'
  channel: 'in-app' | 'line' | 'sms'
  toRole: Role
  sentAt: number
  readAt: number | null
  ackAt: number | null
  escalatedAt: number | null
  resolvedAt: number | null
}

/** รายการในคิวส่งขึ้นเซิร์ฟเวอร์ พร้อม retry/backoff ตาม requirement ข้อ 4 */
export interface OutboxItem {
  id?: number
  localId: string
  table: 'records' | 'photos' | 'tasks' | 'animals'
  op: 'create' | 'update' | 'delete'
  refLocalId: string
  bytes: number
  attempts: number
  nextAttemptAt: number
  lastError: string | null
  createdAt: number
}

/** ค่าพารามิเตอร์ชีววิทยา ปรับได้ตาม ง-02 แล้วมีผลกับการคำนวณกำหนดการ */
export interface BioParams {
  voluntaryWaitDays: number
  uterusCheckDays: number
  readinessCheckDays: number
  estrusCycleDays: number
  estrusWindowHours: number
  goldenPeriodFromHours: number
  goldenPeriodToHours: number
  pregnancyCheckDays: number
  gestationDays: number
  dryOffBeforeCalvingDays: number
  bcsScaleMax: number
  bcsMinBeforeBreeding: number
  alertLeadDays: number
  escalateAfterDays: number
}

export interface Kpi {
  label: string
  value: number
  unit: string
  target: number | null
  trend: number
  hint: string
}
