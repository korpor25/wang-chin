/**
 * แคตตาล็อกกิจกรรมทั้ง 28 รายการ ตามเอกสารแนบ ค
 *
 * เก็บเป็น data ไม่ใช่หน้าจอละไฟล์ เพราะทุกกิจกรรมมีรูปแบบเดียวกันคือ
 * "ใครทำ เมื่อไหร่ กรอกอะไร แล้วระบบเอาไปคำนวณอะไรต่อ"
 * ฟอร์มทั้ง 26 ตัวจึงเรนเดอร์จากสเปกนี้ด้วย ActivityForm ตัวเดียว
 */
import type { Role } from './types'

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'datetime'
  | 'select'
  | 'bool'
  | 'checklist'
  | 'photo'
  | 'animal'
  | 'semen'
  | 'score'

export interface FieldSpec {
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: string[]
  min?: number
  max?: number
  step?: number
  unit?: string
  hint?: string
  /**
   * ช่อง text ที่รับแค่ตัวเลข เช่น RFID 15 หลัก
   * เก็บเป็นข้อความเพื่อไม่ให้เลขศูนย์นำหน้าหาย แต่เปิดแป้นตัวเลขและกรองตัวอื่นทิ้ง
   */
  digits?: boolean
  /** ค่าตั้งต้นตอนเปิดฟอร์ม ใช้กับตัวเลือกที่มีค่าปกติชัดเจน เช่น สเกล BCS ของโคเนื้อ */
  default?: unknown
  /** จำกัดให้เห็นเฉพาะบางบทบาท เช่น ช่องยืนยันผลของสัตวบาลใน ก-07 */
  roles?: Role[]
  /**
   * ไม่ต้องแสดงในฟอร์ม แต่ยังเก็บค่าตั้งต้นไปกับบันทึกเสมอ
   * ใช้กับค่าที่ผู้ใช้ไม่มีทางเลือก แต่ต้องมีติดไว้ในข้อมูลเพื่อให้ตามย้อนได้
   */
  hidden?: boolean
}

export type ActivityGroup = 'field' | 'asset' | 'system' | 'review'

export const GROUP_LABEL: Record<ActivityGroup, string> = {
  field: 'ก · งานภาคสนามรายตัว',
  asset: 'ข · คลังและทรัพย์สิน',
  system: 'ค · ระบบทำอัตโนมัติ',
  review: 'ง · ทบทวนและปรับปรุง',
}

export interface ActivitySpec {
  code: string
  name: string
  group: ActivityGroup
  actors: Role[]
  trigger: string
  detail: string
  /** ต้องระบุตัวสัตว์หรือไม่ */
  needsAnimal: boolean
  fields: FieldSpec[]
  /** ผลลัพธ์ที่ระบบสร้างต่อจากกิจกรรมนี้ ใช้แสดงให้ผู้ใช้เข้าใจว่ากรอกไปแล้วได้อะไร */
  derived: string[]
}

const PHOTO: FieldSpec = { key: 'photos', label: 'ภาพถ่ายประกอบ', type: 'photo' }
const WHO: FieldSpec = { key: 'actor', label: 'ผู้ปฏิบัติ', type: 'text', required: true }

export const ACTIVITIES: ActivitySpec[] = [
  // ── ก · งานภาคสนามรายตัว ──────────────────────────────────────────────
  {
    code: 'ก-01',
    name: 'แจ้งการคลอด',
    group: 'field',
    actors: ['farmer', 'husbandry'],
    trigger: 'พบว่าแม่โคคลอดลูก',
    detail:
      'แจ้งทันทีที่พบพร้อมภาพลูกโค เพื่อให้สัตวบาลเข้าตรวจและระบบเปิดรอบผสมใหม่ได้เร็วที่สุด ความเร็วของการแจ้งมีผลโดยตรงต่อความแม่นยำของกำหนดการทั้งรอบ',
    needsAnimal: true,
    fields: [
      { key: 'foundAt', label: 'วันและเวลาที่พบการคลอด', type: 'datetime', required: true },
      { key: 'calfCount', label: 'จำนวนลูกโค', type: 'number', required: true, min: 1, max: 3 },
      PHOTO,
      { key: 'reporter', label: 'ผู้แจ้ง', type: 'text', required: true },
    ],
    derived: ['รายการรอการยืนยันจากสัตวบาล', 'สัญญาณเริ่มต้นให้ระบบเปิดรอบผสมใหม่'],
  },
  {
    code: 'ก-02',
    name: 'ทำคลอดและบันทึกผลการคลอด',
    group: 'field',
    actors: ['husbandry'],
    trigger: 'ได้รับแจ้งการคลอด หรือถึงกำหนดวันคลอดคาดการณ์',
    detail:
      'บันทึกรายละเอียดการคลอด สร้างทะเบียนลูกโค และปิดรอบการผสมเดิม รกค้างและระดับความยากในการคลอดใช้ทำนายปัญหามดลูกอักเสบในรอบถัดไป',
    needsAnimal: true,
    fields: [
      { key: 'calvedAt', label: 'วันและเวลาที่คลอด', type: 'datetime', required: true },
      { key: 'calfSex', label: 'เพศลูกโค', type: 'select', options: ['เมีย', 'ผู้'] },
      { key: 'calfWeightKg', label: 'น้ำหนักแรกเกิด', type: 'number', unit: 'กก.', min: 5, max: 80 },
      {
        key: 'calfCondition',
        label: 'สภาพลูกโค',
        type: 'select',
        options: ['แข็งแรง', 'อ่อนแอ', 'ตายแรกคลอด'],
      },
      { key: 'calfRfid', label: 'หมายเลข RFID ที่ติดให้ลูกโค', type: 'text', digits: true },
      {
        key: 'difficulty',
        label: 'วิธีการคลอด',
        type: 'select',
        required: true,
        options: ['คลอดปกติ', 'คลอดยาก'],
      },
      {
        key: 'birthStatus',
        label: 'สถานะการคลอดอื่น ๆ',
        type: 'checklist',
        options: ['รกค้าง', 'มดลูกทะลัก'],
      },
      WHO,
      PHOTO,
    ],
    derived: [
      'ทะเบียนลูกโครายใหม่พร้อมสายเลือด',
      'ปิดรอบการผสมเดิมและระบุผลของรอบ',
      'ข้อมูลตั้งต้นสำหรับคำนวณระยะห่างการให้ลูก',
    ],
  },
  {
    code: 'ก-03',
    name: 'ให้คะแนนสภาพร่างกาย (BCS)',
    group: 'field',
    // เกษตรกรให้คะแนนเองได้ระหว่างรอบ ส่วนจุดบันทึกบังคับยังเป็นงานของสัตวบาลตาม rules.ts
    actors: ['husbandry', 'farmer'],
    trigger: 'ถึงจุดบันทึกบังคับ 4 จุดตามวงจร หรือเมื่อเห็นว่าโคผอมหรืออ้วนขึ้น',
    detail:
      'ประเมินด้วยการมองและคลำตามสเกล 1–9 สำหรับโคเนื้อ บันทึกชนิดสเกลควบคู่กับคะแนนเสมอ และแนบภาพมุมหลังกับมุมข้างไว้สอบทาน คะแนน ณ วันคลอดมีอำนาจพยากรณ์สูงสุด',
    needsAnimal: true,
    fields: [
      { key: 'assessedAt', label: 'วันที่ประเมิน', type: 'date', required: true },
      {
        /**
         * สหกรณ์เลี้ยงโคขุนอย่างเดียว จึงใช้สเกลโคเนื้อ 9 ระดับเสมอ ตามมติที่ประชุม [29:56]
         * เคยมีตัวเลือกสเกลโคนม 1–5 ให้เลือกด้วย แต่ตัดออกเพราะไม่มีใครใช้
         * และ lastBcs เก็บเป็นตัวเลขเปล่า ถ้าเผลอเลือกสเกลผิดครั้งเดียว
         * เกณฑ์บล็อกการผสมกับป้ายสีจะตีความผิดทันที
         * ยังเก็บค่าไว้ในบันทึกอยู่ เพื่อให้ตอนย้อนดูรู้ว่าใช้สเกลอะไร
         */
        key: 'scale',
        label: 'ชนิดสเกล',
        type: 'select',
        default: 'BCS 1–9 (โคเนื้อ)',
        hidden: true,
      },
      { key: 'score', label: 'คะแนนที่ให้', type: 'score', required: true, min: 1, max: 9 },
      {
        key: 'stage',
        label: 'ระยะของวงจร',
        type: 'select',
        options: ['ก่อนคลอด', 'วันคลอด', 'หลังคลอด 30 วัน', 'ก่อนเข้าผสม', 'ตั้งท้อง'],
      },
      WHO,
      PHOTO,
    ],
    derived: [
      'แนวโน้มการเปลี่ยนแปลงสภาพร่างกายรายตัว',
      'รายชื่อแม่โคที่ต่ำกว่าเกณฑ์และต้องปรับอาหาร',
      'ความเบี่ยงเบนระหว่างผู้ประเมิน',
    ],
  },
  {
    code: 'ก-04',
    name: 'ตรวจระบบสืบพันธุ์',
    group: 'field',
    actors: ['husbandry'],
    trigger: 'ครบประมาณ 30 วันหลังคลอด ตามกำหนดการที่ระบบสร้าง',
    detail:
      'ตรวจการเข้าอู่ของมดลูกและลักษณะของเหลว เพื่อคัดแม่โคที่ต้องรักษาก่อนเข้าแผนผสม เป็นข้อมูลหลักในการหาสาเหตุการผสมไม่ติด',
    needsAnimal: true,
    fields: [
      { key: 'checkedAt', label: 'วันที่ตรวจ', type: 'date', required: true },
      {
        key: 'involution',
        label: 'สภาพการเข้าอู่ของมดลูก',
        type: 'select',
        required: true,
        options: ['ปกติ', 'ช้ากว่าเกณฑ์', 'ผิดปกติชัดเจน'],
      },
      {
        key: 'discharge',
        label: 'ลักษณะของเหลวจากมดลูก',
        type: 'select',
        options: ['ไม่มี', 'ใส', 'ขุ่นปนหนอง', 'หนองมีกลิ่น'],
      },
      { key: 'treatment', label: 'คำแนะนำหรือการรักษาที่ให้', type: 'textarea' },
      WHO,
    ],
    derived: [
      'รายชื่อแม่โคที่ต้องรักษาก่อนเข้าแผนผสม',
      'อัตราการเกิดมดลูกอักเสบรายฟาร์ม',
      'ข้อมูลวิเคราะห์สาเหตุการผสมไม่ติด',
    ],
  },
  {
    code: 'ก-05',
    name: 'ตรวจความพร้อมก่อนเข้าโปรแกรมผสม',
    group: 'field',
    actors: ['husbandry', 'farmer'],
    trigger: 'สิ้นสุดระยะพักหลังคลอดตามค่าพารามิเตอร์',
    detail: 'ตรวจรังไข่สองข้างและสภาพมดลูก แล้วตัดสินว่าเข้าโปรแกรมได้เลยหรือต้องฟื้นฟูก่อน',
    needsAnimal: true,
    fields: [
      { key: 'checkedAt', label: 'วันที่ตรวจ', type: 'date', required: true },
      {
        key: 'ovaryLeft',
        label: 'ผลตรวจรังไข่ซ้าย',
        type: 'select',
        options: ['ปกติ', 'ไม่ทำงาน', 'พบ CL', 'พบฟอลลิเคิล'],
      },
      {
        key: 'ovaryRight',
        label: 'ผลตรวจรังไข่ขวา',
        type: 'select',
        options: ['ปกติ', 'ไม่ทำงาน', 'พบ CL', 'พบฟอลลิเคิล'],
      },
      { key: 'cyst', label: 'พบถุงน้ำรังไข่', type: 'bool' },
      { key: 'uterus', label: 'สภาพมดลูก', type: 'select', options: ['ปกติ', 'อักเสบ', 'ผิดปกติอื่น'] },
      { key: 'ready', label: 'พร้อมเข้าโปรแกรม', type: 'bool', required: true },
      { key: 'reason', label: 'เหตุผลกรณีไม่พร้อม', type: 'textarea' },
      WHO,
    ],
    derived: [
      'รายชื่อแม่โคที่พร้อมเข้าโปรแกรมรอบนี้',
      'รายชื่อที่ต้องฟื้นฟูก่อนพร้อมเหตุผล',
      'สัดส่วนแม่โคที่พร้อมผสมของแต่ละฟาร์ม',
    ],
  },
  {
    code: 'ก-06',
    name: 'ดำเนินโปรแกรมเหนี่ยวนำการเป็นสัด',
    group: 'field',
    actors: ['husbandry'],
    trigger: 'ถึงเวลาของแต่ละขั้นตอนตามตารางที่ระบบสร้าง',
    detail:
      'บันทึกเวลาปฏิบัติจริงของแต่ละขั้นเทียบกับตาราง ความคลาดเคลื่อนของเวลาคือสาเหตุอันดับต้นของการผสมไม่ติดในโปรแกรมเหนี่ยวนำ',
    needsAnimal: true,
    fields: [
      {
        key: 'program',
        label: 'โปรแกรมที่ใช้',
        type: 'select',
        required: true,
        options: ['Ovsynch', 'CIDR-Synch', 'PGF2α สองเข็ม', 'อื่น ๆ'],
      },
      { key: 'step', label: 'ขั้นตอนที่ปฏิบัติ', type: 'text', required: true },
      { key: 'doneAt', label: 'วันและเวลาที่ปฏิบัติจริง', type: 'datetime', required: true },
      { key: 'drug', label: 'ชื่อยา', type: 'text' },
      { key: 'dose', label: 'ขนาดที่ใช้', type: 'number', unit: 'มล.', min: 0, step: 0.1 },
      { key: 'rfidConfirmed', label: 'ยืนยันตัวสัตว์ด้วย RFID แล้ว', type: 'bool' },
      { key: 'deviationReason', label: 'เหตุผลกรณีล่าช้าหรือข้ามขั้น', type: 'textarea' },
      WHO,
    ],
    derived: [
      'ความสอดคล้องของเวลาปฏิบัติจริงกับตาราง',
      'รายการขั้นตอนที่คลาดเคลื่อนเกินเกณฑ์',
      'อัตราการผสมติดจำแนกตามโปรแกรม',
    ],
  },
  {
    code: 'ก-07',
    name: 'ตรวจและแจ้งอาการเป็นสัด',
    group: 'field',
    actors: ['husbandry', 'farmer'],
    trigger: 'อยู่ในช่วงเฝ้าระวัง หรือได้รับแจ้งเตือนให้สังเกตอาการ',
    detail:
      'เวลาที่พบอาการคือจุดตั้งต้นของการคำนวณช่วงผสมที่เหมาะสม (Golden Period) จึงต้องบันทึกเวลาให้ละเอียดที่สุด',
    needsAnimal: true,
    fields: [
      {
        key: 'purpose',
        label: 'ประเภทการบันทึก',
        type: 'select',
        options: ['เฝ้าระวังการจับสัด', 'เฝ้าระวังการกลับสัด (กรณีผสมไม่ติด)', 'แจ้งโคเป็นสัด'],
      },
      { key: 'observedAt', label: 'วันและเวลาที่พบอาการ', type: 'datetime', required: true },
      {
        key: 'method',
        label: 'วิธีที่ตรวจพบ',
        type: 'select',
        required: true,
        options: ['สังเกตด้วยตา (ดูการขี่กัน)', 'ชอล์กหาง', 'เครื่องวัดการเคลื่อนไหว', 'โคตัวผู้ตรวจสัด'],
      },
      {
        key: 'signs',
        label: 'อาการที่สังเกตได้',
        type: 'checklist',
        options: ['ยืนนิ่งให้ขึ้นทับ', 'ขึ้นทับตัวอื่น', 'เมือกใส', 'บวมแดง', 'กระวนกระวาย'],
      },
      { key: 'reporterType', label: 'ผู้พบ', type: 'select', options: ['สัตวบาล', 'เกษตรกร'] },
      // ขั้นยืนยันตามมติ [22:41] — คำแจ้งของเกษตรกรต้องผ่านสัตวบาลก่อนจึงจะเกิดงานผสม
      {
        key: 'verdict',
        label: 'ผลการยืนยันของสัตวบาล',
        type: 'select',
        required: true,
        options: ['เป็นสัดจริง', 'สัดหลอกหรือไม่ชัด'],
        default: 'เป็นสัดจริง',
        roles: ['husbandry'],
      },
      WHO,
    ],
    derived: [
      'ช่วงเวลาผสมที่เหมาะสมซึ่งระบบคำนวณให้',
      'งานยืนยันของสัตวบาล เมื่อผู้แจ้งเป็นเกษตรกร',
      'อัตราการตรวจพบสัดจำแนกตามวิธีและตามฟาร์ม',
    ],
  },
  {
    code: 'ก-08',
    name: 'ผสมเทียมและบันทึกห่วงโซ่ความเย็น',
    group: 'field',
    actors: ['husbandry'],
    trigger: 'ถึงช่วงเวลาผสมที่เหมาะสม หรือถึงขั้นผสมของโปรแกรมเหนี่ยวนำ',
    detail:
      'หัวใจของทั้งระบบ — บันทึกละเอียดถึงอุณหภูมิและเวลาละลายน้ำเชื้อ เพื่อให้ตอบได้ว่าผสมไม่ติดเพราะคน เพราะน้ำเชื้อ หรือเพราะสภาพอากาศ',
    needsAnimal: true,
    fields: [
      { key: 'inseminatedAt', label: 'วันและเวลาที่สอดเชื้อ', type: 'datetime', required: true },
      { key: 'semenBatchId', label: 'ล็อตน้ำเชื้อ', type: 'semen', required: true },
      { key: 'strawNo', label: 'หมายเลขหลอด', type: 'text' },
      { key: 'outOfTankAt', label: 'เวลาที่นำหลอดออกจากถัง', type: 'datetime' },
      { key: 'thawTempC', label: 'อุณหภูมิการละลาย', type: 'number', unit: '°C', min: 20, max: 45, step: 0.5 },
      { key: 'thawSeconds', label: 'ระยะเวลาการละลาย', type: 'number', unit: 'วินาที', min: 0, max: 300 },
      {
        key: 'depositSite',
        label: 'ตำแหน่งปล่อยน้ำเชื้อ',
        type: 'select',
        options: ['ตัวมดลูก', 'ปีกมดลูกซ้าย', 'ปีกมดลูกขวา', 'คอมดลูก'],
      },
      { key: 'difficulty', label: 'ระดับความยากในการสอด', type: 'select', options: ['ง่าย', 'ปานกลาง', 'ยาก'] },
      { key: 'ambientTempC', label: 'อุณหภูมิขณะปฏิบัติงาน', type: 'number', unit: '°C' },
      { key: 'humidityPct', label: 'ความชื้นขณะปฏิบัติงาน', type: 'number', unit: '%' },
      { key: 'rfidConfirmed', label: 'ยืนยันตัวสัตว์ด้วย RFID แล้ว', type: 'bool' },
      { key: 'method', label: 'วิธีผสม', type: 'select', required: true, options: ['ผสมเทียม', 'ผสมธรรมชาติ'] },
      WHO,
    ],
    derived: [
      'ระยะเวลาจากเริ่มเป็นสัดถึงสอดเชื้อ',
      'ลำดับครั้งที่ผสมในรอบนี้',
      'การตัดสต๊อกน้ำเชื้ออัตโนมัติ',
      'ข้อมูลวิเคราะห์อัตราการผสมติดรายผู้ผสมและรายล็อต',
    ],
  },
  {
    code: 'ก-09',
    name: 'ตรวจท้อง',
    group: 'field',
    actors: ['husbandry'],
    trigger: 'ครบกำหนดตามวิธีตรวจที่เลือก นับจากวันผสม',
    detail: 'ผลตรวจเป็นตัวตัดสินว่ารอบนี้จบหรือต้องเริ่มใหม่ และเป็นที่มาของวันคลอดคาดการณ์',
    needsAnimal: true,
    fields: [
      { key: 'checkedAt', label: 'วันที่ตรวจ', type: 'date', required: true },
      {
        key: 'method',
        label: 'วิธีที่ใช้ตรวจ',
        type: 'select',
        required: true,
        options: ['อัลตร้าซาวด์', 'ล้วงตรวจ', 'ตรวจเลือด', 'ตรวจน้ำนม'],
      },
      { key: 'result', label: 'ผลการตรวจ', type: 'select', required: true, options: ['ตั้งท้อง', 'ไม่ตั้งท้อง', 'สงสัย ตรวจซ้ำ'] },
      { key: 'gestationDays', label: 'อายุครรภ์โดยประมาณ', type: 'number', unit: 'วัน', min: 0, max: 290 },
      WHO,
    ],
    derived: [
      'วันคลอดคาดการณ์ที่ระบบคำนวณให้',
      'อัตราการผสมติดของการผสมครั้งนั้น',
      'เปลี่ยนสถานะแม่โคและสร้างกำหนดการช่วงตั้งท้อง',
    ],
  },
  {
    code: 'ก-10',
    name: 'ตรวจโรค รักษา และป้องกัน',
    group: 'field',
    actors: ['husbandry'],
    trigger: 'ตามแผนประจำ พบอาการผิดปกติ หรือถึงกำหนดที่ระบบแจ้ง',
    detail: 'ระยะหยุดยาสำคัญมาก เพราะกระทบทั้งความปลอดภัยอาหารและแผนการผสม',
    needsAnimal: true,
    fields: [
      { key: 'doneAt', label: 'วันที่ดำเนินการ', type: 'date', required: true },
      {
        key: 'kind',
        label: 'ประเภทกิจกรรม',
        type: 'select',
        required: true,
        options: ['ตรวจโรค', 'รักษา', 'วัคซีน', 'ถ่ายพยาธิ', 'แต่งกีบ'],
      },
      { key: 'condition', label: 'อาการหรือโรคที่รักษา', type: 'text' },
      { key: 'drug', label: 'ชื่อยา', type: 'text' },
      { key: 'dose', label: 'ขนาดที่ให้', type: 'number', unit: 'มล.', min: 0, step: 0.1 },
      { key: 'withdrawalDays', label: 'ระยะหยุดยา', type: 'number', unit: 'วัน', min: 0, max: 120 },
      { key: 'site', label: 'ตำแหน่งที่เกี่ยวข้อง (กรณีกีบและขา)', type: 'text' },
      { key: 'outcome', label: 'ผลการรักษา', type: 'select', options: ['หาย', 'ดีขึ้น', 'ไม่ดีขึ้น', 'รอติดตาม'] },
      WHO,
      PHOTO,
    ],
    derived: [
      'สถานะสุขภาพรายตัวและรายฝูง',
      'รายชื่อสัตว์ที่อยู่ระหว่างระยะหยุดยา',
      'แนวโน้มการดื้อยาจากประวัติการใช้ยา',
    ],
  },
  {
    code: 'ก-11',
    name: 'เตรียมโคและคอกคลอดตามแจ้งเตือน',
    group: 'field',
    actors: ['farmer'],
    trigger: 'ได้รับแจ้งเตือนล่วงหน้าจากระบบ',
    detail: 'วัดว่าเกษตรกรตอบสนองต่อการแจ้งเตือนจริงหรือไม่ ซึ่งเป็นตัวชี้ว่าปัญหาอยู่ที่การแจ้งหรือการปฏิบัติ',
    needsAnimal: true,
    fields: [
      { key: 'willDo', label: 'ยืนยันว่าจะดำเนินการ', type: 'bool', required: true },
      { key: 'doneAt', label: 'วันเวลาที่ดำเนินการจริง', type: 'datetime' },
      { key: 'obstacle', label: 'ปัญหาหรืออุปสรรคที่พบ', type: 'textarea' },
    ],
    derived: ['สถานะความพร้อมของโคก่อนสัตวบาลเข้าพื้นที่', 'อัตราการตอบสนองต่อการแจ้งเตือนรายฟาร์ม'],
  },
  {
    code: 'ก-12',
    name: 'ป้อนนมน้ำเหลืองลูกโค',
    group: 'field',
    actors: ['farmer', 'husbandry'],
    trigger: 'แจ้งเตือนทันทีที่บันทึกการคลอด ต้องป้อนภายใน 12 ชั่วโมงหลังคลอด',
    detail: 'ลูกโคต้องได้รับนมน้ำเหลืองภายใน 12 ชั่วโมงแรก เพื่อรับภูมิคุ้มกันจากแม่ ยิ่งช้าลูกโคยิ่งดูดซึมภูมิคุ้มกันได้น้อยลง',
    needsAnimal: true,
    fields: [
      { key: 'fedAt', label: 'วันและเวลาที่ป้อนนมน้ำเหลือง', type: 'datetime', required: true },
      { key: 'amountL', label: 'ปริมาณที่ป้อน', type: 'number', unit: 'ลิตร', min: 0, max: 10, step: 0.1 },
      { key: 'method', label: 'วิธีป้อน', type: 'select', options: ['ลูกโคดูดเอง', 'ป้อนขวด', 'ป้อนท่อ'] },
      { key: 'reporter', label: 'ผู้ป้อน', type: 'text', required: true },
    ],
    derived: ['บันทึกว่าลูกโคได้รับนมน้ำเหลืองทันเวลา', 'อัตราการป้อนทันใน 12 ชั่วโมงรายฟาร์ม'],
  },
  {
    code: 'ก-13',
    name: 'ดูแลลูกโคหลังคลอด 2 สัปดาห์',
    group: 'field',
    actors: ['husbandry'],
    trigger: 'ครบ 2 สัปดาห์หลังคลอด ตามกำหนดการที่ระบบสร้าง',
    detail: 'สูญเขาลูกโคและติดเบอร์หู RFID ให้ลูกโค เพื่อขึ้นทะเบียนตัวสัตว์',
    needsAnimal: true,
    fields: [
      { key: 'doneAt', label: 'วันที่ดำเนินการ', type: 'date', required: true },
      {
        key: 'tasksDone',
        label: 'สิ่งที่ดำเนินการแล้ว',
        type: 'checklist',
        required: true,
        options: ['สูญเขาลูกโค', 'ติดเบอร์หู RFID'],
      },
      { key: 'calfRfid', label: 'หมายเลข RFID ที่ติดให้ลูกโค', type: 'text', digits: true },
      WHO,
    ],
    derived: ['ทะเบียนลูกโคที่ติดเบอร์หูแล้ว', 'รายการลูกโคที่ยังไม่ได้สูญเขา'],
  },

  // ── ข · คลังและทรัพย์สิน ──────────────────────────────────────────────
  {
    code: 'ข-01',
    name: 'รับเข้าและจัดเก็บน้ำเชื้อ',
    group: 'asset',
    actors: ['coop'],
    trigger: 'ได้รับน้ำเชื้อจากศูนย์ผลิตหรือผู้จำหน่าย',
    detail: 'ตั้งต้นสต๊อกและผังตำแหน่งจัดเก็บ พร้อมตั้งกำหนดตรวจคุณภาพและเตือนวันหมดอายุ',
    needsAnimal: false,
    fields: [
      { key: 'lotNo', label: 'หมายเลขล็อต', type: 'text', required: true },
      { key: 'sireCode', label: 'รหัสพ่อพันธุ์', type: 'text', required: true },
      { key: 'sireName', label: 'ชื่อพ่อพันธุ์', type: 'text' },
      { key: 'breed', label: 'สายพันธุ์', type: 'text' },
      { key: 'bloodPct', label: 'เปอร์เซ็นต์สายเลือด', type: 'number', unit: '%', min: 0, max: 100 },
      { key: 'collectedAt', label: 'วันที่รีด', type: 'date', required: true },
      { key: 'expiresAt', label: 'วันหมดอายุ', type: 'date' },
      { key: 'spermCount', label: 'จำนวนอสุจิตามใบรับรอง', type: 'number', unit: 'ล้านตัว' },
      { key: 'motilityCert', label: 'การเคลื่อนที่ตามใบรับรอง', type: 'number', unit: '%', min: 0, max: 100 },
      { key: 'morphologyCert', label: 'รูปร่างปกติตามใบรับรอง', type: 'number', unit: '%', min: 0, max: 100 },
      { key: 'straws', label: 'จำนวนหลอด', type: 'number', required: true, min: 1 },
      { key: 'tankId', label: 'ถังที่จัดเก็บ', type: 'text', required: true },
      { key: 'canister', label: 'ตำแหน่ง/กระบอก', type: 'text' },
      { key: 'receivedAt', label: 'วันที่รับเข้า', type: 'date', required: true },
      WHO,
    ],
    derived: ['สต๊อกน้ำเชื้อคงเหลือรายพ่อพันธุ์', 'ผังตำแหน่งจัดเก็บที่เป็นปัจจุบัน', 'กำหนดการตรวจคุณภาพและเตือนหมดอายุ'],
  },
  {
    code: 'ข-02',
    name: 'ตรวจคุณภาพน้ำเชื้อ',
    group: 'asset',
    actors: ['coop', 'husbandry'],
    trigger: 'เมื่อรับเข้า ครบรอบ 6 เดือน หรือเมื่อสงสัยผลผิดปกติ',
    detail: 'เทียบค่าที่ตรวจได้จริงกับค่าตามใบรับรอง เพื่อจับล็อตที่เสื่อมสภาพก่อนเอาไปผสม',
    needsAnimal: false,
    fields: [
      { key: 'semenBatchId', label: 'ล็อตที่ตรวจ', type: 'semen', required: true },
      { key: 'checkedAt', label: 'วันที่ตรวจ', type: 'date', required: true },
      {
        key: 'reason',
        label: 'เหตุผลการตรวจ',
        type: 'select',
        options: ['ตรวจตอนรับเข้า', 'ครบรอบ 6 เดือน', 'สงสัยผลผิดปกติ'],
      },
      { key: 'motilityPost', label: 'การเคลื่อนที่ไปข้างหน้าหลังละลาย', type: 'number', unit: '%', min: 0, max: 100, required: true },
      { key: 'viability', label: 'อัตราการมีชีวิต', type: 'number', unit: '%', min: 0, max: 100 },
      { key: 'abnormalPct', label: 'สัดส่วนรูปร่างผิดปกติ', type: 'number', unit: '%', min: 0, max: 100 },
      { key: 'verdict', label: 'ผลการตัดสิน', type: 'select', required: true, options: ['ใช้ได้', 'เฝ้าระวัง', 'ห้ามใช้'] },
      { key: 'nextQcAt', label: 'กำหนดวันตรวจครั้งถัดไป', type: 'date' },
      WHO,
    ],
    derived: ['สถานะการใช้งานของล็อต', 'แนวโน้มการเสื่อมสภาพของล็อตที่เก็บนาน', 'เทียบค่าใบรับรองกับค่าที่ตรวจได้จริง'],
  },
  {
    code: 'ข-03',
    name: 'วัดระดับไนโตรเจนเหลว',
    group: 'asset',
    actors: ['coop'],
    trigger: 'ครบรอบทุก 1–2 สัปดาห์',
    detail: 'อัตราการระเหยที่สูงผิดปกติคือสัญญาณว่าถังกำลังจะเสีย ซึ่งอาจทำให้น้ำเชื้อทั้งถังเสียหาย',
    needsAnimal: false,
    fields: [
      { key: 'tankId', label: 'ถัง', type: 'text', required: true },
      { key: 'measuredAt', label: 'วันที่วัด', type: 'date', required: true },
      { key: 'levelCm', label: 'ระดับที่วัดได้', type: 'number', unit: 'ซม.', required: true, min: 0 },
      { key: 'refilledL', label: 'เติมไนโตรเจนในครั้งนี้', type: 'number', unit: 'ลิตร', min: 0 },
      WHO,
    ],
    derived: ['อัตราการระเหยของแต่ละถัง', 'แจ้งเตือนเมื่ออัตราการระเหยสูงผิดปกติ', 'ประเมินอายุการใช้งานคงเหลือของถัง'],
  },
  {
    code: 'ข-04',
    name: 'จัดกลุ่มโคและกำหนดสูตรอาหาร',
    group: 'asset',
    actors: ['coop'],
    trigger: 'เมื่อแม่โคเปลี่ยนระยะของวงจร หรือเมื่อเปลี่ยนสูตรอาหาร',
    detail: 'ทำให้ย้อนกลับได้ว่าแม่โคตัวใดได้รับสูตรใดในช่วงใด ซึ่งใช้เชื่อมกับผลการผสมติด',
    needsAnimal: true,
    fields: [
      { key: 'groupName', label: 'กลุ่ม', type: 'text', required: true },
      { key: 'enteredAt', label: 'วันที่เข้ากลุ่ม', type: 'date', required: true },
      { key: 'leftAt', label: 'วันที่ออกจากกลุ่ม', type: 'date' },
      { key: 'formula', label: 'สูตรอาหารที่ใช้', type: 'text', required: true },
      { key: 'kgPerDay', label: 'ปริมาณต่อตัวต่อวัน', type: 'number', unit: 'กก.', min: 0 },
      { key: 'supplements', label: 'แร่ธาตุและวิตามินเสริม', type: 'text' },
      WHO,
    ],
    derived: ['ประวัติย้อนกลับสูตรอาหารรายตัว', 'ความเชื่อมโยงระหว่างสูตรอาหารกับผลการผสมติด', 'แผนความต้องการวัตถุดิบ'],
  },
  {
    code: 'ข-05',
    name: 'สุ่มตรวจคุณภาพวัตถุดิบอาหารสัตว์',
    group: 'asset',
    actors: ['coop'],
    trigger: 'เมื่อรับวัตถุดิบเข้า หรือตามแผนสุ่มตรวจ',
    detail: 'สารพิษจากเชื้อรากดการสืบพันธุ์โดยตรง จึงต้องผูกล็อตวัตถุดิบกับกลุ่มโคที่ได้รับ',
    needsAnimal: false,
    fields: [
      { key: 'lotNo', label: 'ล็อตวัตถุดิบ', type: 'text', required: true },
      { key: 'material', label: 'ชนิดวัตถุดิบ', type: 'text', required: true },
      { key: 'supplier', label: 'ผู้จำหน่าย', type: 'text' },
      { key: 'checkedAt', label: 'วันที่ตรวจ', type: 'date', required: true },
      { key: 'moisturePct', label: 'ค่าความชื้น', type: 'number', unit: '%', min: 0, max: 100 },
      { key: 'aflatoxinPpb', label: 'อะฟลาทอกซิน', type: 'number', unit: 'ppb', min: 0 },
      { key: 'zearalenonePpb', label: 'ซีราลีโนน', type: 'number', unit: 'ppb', min: 0 },
      { key: 'verdict', label: 'ผลการตัดสิน', type: 'select', required: true, options: ['ผ่าน', 'กักไว้', 'ไม่ผ่าน'] },
      WHO,
    ],
    derived: ['สถานะการใช้งานของล็อตวัตถุดิบ', 'ความเชื่อมโยงล็อตปนเปื้อนกับผลผสมติดของกลุ่มที่ได้รับ', 'คะแนนคุณภาพรายผู้จำหน่าย'],
  },
  {
    code: 'ข-06',
    name: 'ตรวจนับและออกแท็ก RFID ทดแทน',
    group: 'asset',
    actors: ['coop', 'husbandry'],
    trigger: 'ตรวจนับประจำปี หรือพบว่าแท็กหลุดหายหรืออ่านไม่ได้',
    detail: 'แท็กหายคือจุดที่ประวัติสัตว์รายตัวขาดตอน จึงต้องออกทดแทนพร้อมผูกกับตัวเดิมให้ได้',
    needsAnimal: true,
    fields: [
      { key: 'countedAt', label: 'วันที่ตรวจนับ', type: 'date', required: true },
      { key: 'oldTag', label: 'แท็กเดิมที่หายหรือชำรุด', type: 'text' },
      { key: 'cause', label: 'สาเหตุ', type: 'select', options: ['หลุดหาย', 'ชำรุด', 'อ่านไม่ได้', 'ไม่เคยมี'] },
      { key: 'newTag', label: 'หมายเลขแท็กใหม่', type: 'text', required: true },
      { key: 'attachedAt', label: 'วันที่ติด', type: 'date' },
      WHO,
    ],
    derived: ['อัตราการหลุดหายของแท็กต่อปี', 'รายชื่อสัตว์ที่ยังไม่มีแท็กใช้งาน', 'ความต่อเนื่องของประวัติสัตว์รายตัว'],
  },
  {
    code: 'ข-07',
    name: 'อบรมสอบเทียบผู้ให้คะแนน BCS',
    group: 'asset',
    actors: ['coop'],
    trigger: 'ครบรอบปีละครั้ง',
    detail: 'ถ้าผู้ประเมินให้คะแนนไม่ตรงกัน ข้อมูล BCS ทั้งระบบจะเชื่อถือไม่ได้ จึงต้องสอบเทียบเป็นรอบ',
    needsAnimal: false,
    fields: [
      { key: 'trainedAt', label: 'วันที่อบรม', type: 'date', required: true },
      { key: 'participants', label: 'รายชื่อผู้เข้าร่วม', type: 'textarea', required: true },
      { key: 'scoresGiven', label: 'คะแนนที่แต่ละคนให้กับโคชุดทดสอบ', type: 'textarea' },
      { key: 'reference', label: 'ค่าอ้างอิงที่ตกลงร่วมกัน', type: 'text' },
      WHO,
    ],
    derived: ['ค่าเบี่ยงเบนของผู้ประเมินแต่ละคน', 'รายชื่อผู้ที่ควรทบทวนเพิ่มเติม', 'ความน่าเชื่อถือของข้อมูล BCS โดยรวม'],
  },

  // ── ค · ระบบทำอัตโนมัติ ───────────────────────────────────────────────
  {
    code: 'ค-01',
    name: 'คำนวณกำหนดการจากพารามิเตอร์ชีววิทยา',
    group: 'system',
    actors: ['coop'],
    trigger: 'เมื่อมีเหตุการณ์ตั้งต้น เช่น การคลอดหรือการผสม',
    detail: 'ระบบสร้างกำหนดการทั้งรอบให้อัตโนมัติ ผู้ใช้ไม่ต้องกรอกเอง หน้านี้ใช้ดูว่าระบบสร้างอะไรไว้บ้างและมาจากไหน',
    needsAnimal: false,
    fields: [],
    derived: ['ปฏิทินกิจกรรมล่วงหน้าทั้งรอบ', 'รายการงานประจำวันของสัตวบาลแต่ละคน', 'วันคลอดคาดการณ์และวันคาดว่าจะกลับเป็นสัด'],
  },
  {
    code: 'ค-02',
    name: 'สร้างกำหนดการงานตามรอบของทรัพย์สิน',
    group: 'system',
    actors: ['coop'],
    trigger: 'เมื่อถึงรอบเวลาของทรัพย์สินหรือคลังแต่ละรายการ',
    detail: 'งานคลังอย่างวัดไนโตรเจนหรือตรวจคุณภาพน้ำเชื้อถูกสร้างเป็นงานล่วงหน้าเช่นเดียวกับงานรายตัว',
    needsAnimal: false,
    fields: [],
    derived: ['ปฏิทินงานคลังและทรัพย์สินล่วงหน้า', 'รายการงานที่ใกล้ครบกำหนดและที่เลยกำหนดแล้ว'],
  },
  {
    code: 'ค-03',
    name: 'ส่งแจ้งเตือนและติดตามผลตอบสนอง',
    group: 'system',
    actors: ['coop'],
    trigger: 'ถึงเวลาแจ้งล่วงหน้าตามกฎของแต่ละบทบาท',
    detail: 'บันทึกทั้งเวลาที่ส่ง เปิดอ่าน และยืนยันจะปฏิบัติ เพื่อแยกให้ออกว่าปัญหาคือไม่ได้รับแจ้ง รับแล้วไม่ทำ หรือทำแล้วไม่ได้ผล',
    needsAnimal: false,
    fields: [],
    derived: ['อัตราการเปิดอ่านและยืนยันรายบุคคลและรายฟาร์ม', 'แยกแยะสาเหตุของงานที่ไม่ถูกปฏิบัติ'],
  },
  {
    code: 'ค-04',
    name: 'ยกระดับรายการที่เลยกำหนด',
    group: 'system',
    actors: ['coop'],
    trigger: 'เลยกำหนดเกินระยะที่ตั้งไว้โดยไม่มีการยืนยันการปฏิบัติ',
    detail: 'งานที่ค้างจะถูกส่งต่อให้เจ้าหน้าที่สหกรณ์ติดตาม ไม่ปล่อยให้เงียบหายไป',
    needsAnimal: false,
    fields: [],
    derived: ['รายการค้างที่ต้องติดตามของเจ้าหน้าที่สหกรณ์', 'อัตราการปฏิบัติงานตรงตามกำหนดรายประเภทและรายบุคคล'],
  },
  {
    code: 'ค-05',
    name: 'ดึงข้อมูลสภาพอากาศและคำนวณดัชนีความเครียดจากความร้อน',
    group: 'system',
    actors: ['coop'],
    trigger: 'ทุกวันโดยอัตโนมัติ',
    detail: 'ค่า THI สูงกดอัตราการผสมติดอย่างชัดเจน ใช้วางแผนว่าช่วงไหนของปีไม่ควรผสมจำนวนมาก',
    needsAnimal: false,
    fields: [],
    derived: ['ความสัมพันธ์ระหว่างความเครียดจากความร้อนกับอัตราการผสมติด', 'ช่วงเวลาของปีที่ควรหลีกเลี่ยงการวางแผนผสมจำนวนมาก'],
  },
  {
    code: 'ค-06',
    name: 'คำนวณตัวชี้วัดด้านการสืบพันธุ์',
    group: 'system',
    actors: ['coop'],
    trigger: 'ทุกครั้งที่มีข้อมูลใหม่ และสรุปตามรอบเวลา',
    detail: 'แปลงบันทึกดิบให้เป็นตัวชี้วัดที่เทียบกับเป้าหมายได้ และจัดอันดับเพื่อชี้จุดที่ควรแก้ไข',
    needsAnimal: false,
    fields: [],
    derived: [
      'อัตราการผสมติดและอัตราการนำเข้าผสม',
      'จำนวนครั้งที่ผสมต่อการติดและระยะห่างการให้ลูก',
      'การเปรียบเทียบกับค่าฐานและค่าเป้าหมาย',
    ],
  },

  // ── ง · ทบทวนและปรับปรุง ──────────────────────────────────────────────
  {
    code: 'ง-01',
    name: 'ทบทวนแดชบอร์ดและระบุสาเหตุ',
    group: 'review',
    actors: ['coop'],
    trigger: 'ตามรอบการประชุมประจำเดือนหรือประจำไตรมาส',
    detail: 'บันทึกมติที่ประชุมพร้อมหลักฐาน เพื่อให้ตามได้ว่ามาตรการไหนได้ผลจริง',
    needsAnimal: false,
    fields: [
      { key: 'meetingAt', label: 'วันที่ประชุม', type: 'date', required: true },
      { key: 'conclusion', label: 'ข้อสรุปของที่ประชุม', type: 'textarea', required: true },
      { key: 'rootCause', label: 'สาเหตุที่ระบุได้และหลักฐานประกอบ', type: 'textarea' },
      { key: 'measures', label: 'มาตรการที่ตกลงจะดำเนินการ', type: 'textarea' },
      { key: 'owner', label: 'ผู้รับผิดชอบ', type: 'text' },
      { key: 'dueAt', label: 'กำหนดเวลา', type: 'date' },
    ],
    derived: ['รายการสาเหตุจัดลำดับตามผลกระทบ', 'แผนปรับปรุงพร้อมกำหนดเวลา', 'ประเด็นที่ต้องเก็บข้อมูลเพิ่ม'],
  },
  {
    code: 'ง-02',
    name: 'ปรับปรุงการปฏิบัติงานและค่าพารามิเตอร์',
    group: 'review',
    actors: ['coop'],
    trigger: 'เมื่อที่ประชุมมีมติให้ดำเนินการ',
    detail: 'การเปลี่ยนค่าพารามิเตอร์ต้องเก็บค่าเดิมไว้เสมอ เพื่อเทียบผลก่อนและหลัง',
    needsAnimal: false,
    fields: [
      { key: 'measure', label: 'มาตรการที่ดำเนินการ', type: 'textarea', required: true },
      { key: 'effectiveAt', label: 'วันที่มีผล', type: 'date', required: true },
      { key: 'paramKey', label: 'พารามิเตอร์ที่ปรับ', type: 'text' },
      { key: 'oldValue', label: 'ค่าเดิม', type: 'text' },
      { key: 'newValue', label: 'ค่าใหม่', type: 'text' },
      { key: 'trainees', label: 'ผู้เข้ารับการอบรมและหัวข้อ', type: 'textarea' },
      WHO,
    ],
    derived: ['ประวัติการเปลี่ยนแปลงที่ใช้เทียบผลก่อนและหลัง', 'หลักฐานว่ามาตรการใดได้ผลจริง'],
  },
]

export const ACTIVITY_BY_CODE = new Map(ACTIVITIES.map((a) => [a.code, a]))

/**
 * ขอบเขตของเฟสนี้ — ทำเฉพาะ **ภาค ก · งานภาคสนามรายตัว** (ก-01 ถึง ก-13)
 *
 * แคตตาล็อกยังเก็บครบทั้ง 28 รายการไว้เป็นเอกสารอ้างอิงของโครงการ
 * แต่หน้าจอที่ผู้ใช้กรอกได้จริงตัดเหลือภาค ก อย่างเดียว
 * เปิดภาคอื่นเมื่อถึงเฟสถัดไปได้ด้วยการเพิ่มกลุ่มลงในค่านี้ที่เดียว
 */
export const PHASE_GROUPS: ActivityGroup[] = ['field']

/** กิจกรรมที่อยู่ในขอบเขตของเฟสนี้ */
export const PHASE_ACTIVITIES = ACTIVITIES.filter((a) => PHASE_GROUPS.includes(a.group))

const PHASE_CODES = new Set(PHASE_ACTIVITIES.map((a) => a.code))

/**
 * รหัสกิจกรรมนี้อยู่ในขอบเขตเฟสนี้ไหม
 *
 * ใช้กรองงานที่ค้างอยู่ในเครื่องจากชุดข้อมูลเก่า หรือที่เซิร์ฟเวอร์ส่งมาในอนาคต
 * ซ่อนเมนูอย่างเดียวไม่พอ เพราะงานเข้ามาทางกำหนดการได้อีกทาง
 */
export function inPhase(code: string): boolean {
  return PHASE_CODES.has(code)
}

export function activitiesForRole(role: Role): ActivitySpec[] {
  return PHASE_ACTIVITIES.filter((a) => a.actors.includes(role))
}

