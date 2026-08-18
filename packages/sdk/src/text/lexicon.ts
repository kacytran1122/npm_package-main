/**
 * Curated lexicons for the unspaced scripts.
 *
 * The word segmenter is a unigram cost model, so all it needs from a lexicon
 * is a set of words and a rough sense of which are common. Frequencies are not
 * stored: the lists are written in descending frequency and the cost of a word
 * is derived from its rank, which is a Zipf approximation and is accurate
 * enough that the Viterbi search picks the same path a real frequency table
 * would. It also means a contributor adding a word only has to decide roughly
 * where it goes, not invent a number.
 *
 * Two editorial rules keep the model honest:
 *
 * 1. **Simple words only.** `ทำงาน` (to work) is lexicalised and belongs here.
 *    `ภาษาไทย` (Thai language) is a transparent noun phrase — two words — and
 *    does not. Adding transparent compounds makes the segmenter silently
 *    under-split, which is the failure mode that is hardest to notice.
 * 2. **No proper nouns except the ones an interface actually prints.** Place
 *    names that appear in address forms earn their place; personal names do not.
 *
 * The lists are deliberately small. A unigram model degrades gracefully: an
 * unknown run still gets legal break points from the orthographic layer, it
 * just does not get *word* boundaries. Coverage of the top few hundred forms
 * buys most of the accuracy; the long tail buys very little and costs bundle
 * size on every page load.
 *
 * Applications can extend any locale at runtime with `registerWords()`.
 */

import { resolveLocale } from "../locales/index.js";

/**
 * Rank offset in the Zipf cost model. Higher values flatten the curve between
 * common and rare words; 40 keeps the most common function words meaningfully
 * cheaper than the tail without letting them swallow neighbours.
 */
const RANK_OFFSET = 40;

export interface Lexicon {
  /** Word to cost, in nats. Lower is more likely. */
  readonly cost: ReadonlyMap<string, number>;
  /** Longest entry, in UTF-16 code units. Bounds the Viterbi window. */
  readonly maxLength: number;
}

// ---------------------------------------------------------------------- data
// Each string is one frequency band, most common band first. Splitting on
// whitespace at module load costs microseconds and keeps the source readable
// and diffable, which matters because these are maintained by hand.

const THAI = [
  "ที่ และ ของ ใน การ เป็น ได้ มี ไม่ ให้ จะ ความ กับ นี้ ว่า มา ไป ทำ ด้วย จาก",
  "ต้อง แล้ว หรือ อยู่ ก็ ผู้ เรา คุณ ผม ฉัน เขา เธอ พวก มัน ยัง ถ้า เพราะ เมื่อ แต่ ทั้ง",
  "อีก ทุก บาง หลาย มาก น้อย ดี ใหม่ เก่า ใหญ่ เล็ก สูง ต่ำ ยาว สั้น เร็ว ช้า ง่าย ยาก อย่าง",
  "คน เวลา วัน เดือน ปี ชั่วโมง นาที วินาที วันนี้ พรุ่งนี้ เมื่อวาน สัปดาห์ ตอน ครั้ง เรื่อง สิ่ง ที่นี่ ตรง ทาง",
  "ภาษา ไทย อังกฤษ คำ ประโยค ข้อความ ข้อมูล ระบบ เครื่อง โทรศัพท์ คอมพิวเตอร์ อินเทอร์เน็ต เว็บไซต์ หน้า ปุ่ม รูป ไฟล์ รายการ รายละเอียด ตัวอย่าง",
  "ชื่อ นามสกุล ที่อยู่ อีเมล รหัส ผ่าน รหัสผ่าน บัญชี ผู้ใช้ สมาชิก ลงทะเบียน เข้าสู่ระบบ เข้า ออก สมัคร ยินดี ต้อนรับ",
  "ราคา เงิน บาท ค่า ส่ง สินค้า สั่ง ซื้อ ขาย จ่าย ชำระ ยอด รวม ภาษี มูลค่า ส่วนลด ฟรี บริการ ลูกค้า ร้าน",
  "กรุณา โปรด ขอ ขอบคุณ สวัสดี ครับ ค่ะ คะ นะ จ้า ช่วย แนะนำ ติดต่อ สอบถาม",
  "รัก ชอบ ต้องการ อยาก คิด รู้ เข้าใจ เห็น ดู ฟัง พูด อ่าน เขียน เรียน สอน ทำงาน งาน บ้าน เมือง",
  "ประเทศ จังหวัด กรุงเทพมหานคร กรุงเทพ มหานคร ถนน ตำบล อำเภอ เขต แขวง โรงเรียน",
  "สำเร็จ ผิด ถูก ถูกต้อง พลาด ลอง พบ ตรวจสอบ ยืนยัน ยกเลิก บันทึก แก้ไข ลบ เพิ่ม ค้นหา เลือก เปลี่ยน อัปเดต ดาวน์โหลด กรอก ปิด เปิด",
  "รองรับ แปล อัตโนมัติ ระงับ ชั่วคราว ปลอดภัย จำเป็น สำคัญ สำหรับ พร้อม เสร็จ เริ่ม จบ ถัดไป ก่อน หลัง เชื่อมต่อ ล้มเหลว สั่งซื้อ",
  "หนึ่ง สอง สาม สี่ ห้า หก เจ็ด แปด เก้า สิบ ร้อย พัน หมื่น แสน ล้าน จำนวน ทั้งหมด",
  "เล่ม ตัว อัน คัน แผ่น ลูก หลัง ต้น คู่ ผืน ชิ้น ใบ",
  "แมว หมา หนังสือ รถ น้ำ อาหาร ข้าว ไฟ ลม ดิน ฟ้า ทะเล ภูเขา ดอกไม้ ต้นไม้",
].join(" ");

const LAO = [
  "ຂອງ ໃນ ທີ່ ເປັນ ມີ ບໍ່ ໄດ້ ໃຫ້ ຈະ ກັບ ຈາກ ແຕ່ ຫຼື ກໍ ຢູ່ ມາ ໄປ ແລະ ນີ້ ນັ້ນ",
  "ຂ້ອຍ ເຮົາ ທ່ານ ເຈົ້າ ລາວ ເພິ່ນ ພວກ ຄົນ ຜູ້ ຄວາມ ການ ຢ່າງ ຫຼາຍ ໜ້ອຍ ດີ ໃໝ່ ເກົ່າ ໃຫຍ່ ນ້ອຍ ໄວ",
  "ວັນ ເວລາ ປີ ເດືອນ ຊົ່ວໂມງ ນາທີ ວິນາທີ ມື້ ອາທິດ ເທື່ອ ຄັ້ງ ເລື່ອງ ສິ່ງ",
  "ພາສາ ຄໍາ ຂໍ້ຄວາມ ຂໍ້ມູນ ລະບົບ ເຄື່ອງ ໂທລະສັບ ຄອມພິວເຕີ ເວັບໄຊ ໜ້າ ປຸ່ມ ຮູບ ໄຟລ໌ ລາຍການ",
  "ຊື່ ນາມສະກຸນ ທີ່ຢູ່ ອີເມວ ລະຫັດ ຜ່ານ ບັນຊີ ຜູ້ໃຊ້ ສະມາຊິກ ລົງທະບຽນ ເຂົ້າ ອອກ ໃສ່",
  "ລາຄາ ເງິນ ກີບ ຄ່າ ສົ່ງ ສິນຄ້າ ສັ່ງ ຊື້ ຂາຍ ຈ່າຍ ຊໍາລະ ຍອດ ລວມ ພາສີ ສ່ວນຫຼຸດ ບໍລິການ ລູກຄ້າ ຮ້ານ",
  "ກະລຸນາ ຂໍ ຂອບໃຈ ສະບາຍດີ ຊ່ວຍ ແນະນໍາ ຕິດຕໍ່ ສອບຖາມ",
  "ຮັກ ມັກ ຕ້ອງການ ຢາກ ຄິດ ຮູ້ ເຂົ້າໃຈ ເຫັນ ເບິ່ງ ຟັງ ເວົ້າ ອ່ານ ຂຽນ ຮຽນ ສອນ ເຮັດ ວຽກ ເຮືອນ ເມືອງ",
  "ປະເທດ ແຂວງ ນະຄອນ ວຽງຈັນ ຖະໜົນ ບ້ານ",
  "ສໍາເລັດ ຜິດ ຖືກ ພາດ ລອງ ພົບ ກວດສອບ ຢືນຢັນ ຍົກເລີກ ບັນທຶກ ແກ້ໄຂ ລຶບ ເພີ່ມ ຄົ້ນຫາ ເລືອກ ປ່ຽນ ອັບເດດ ປິດ ເປີດ",
  "ຮອງຮັບ ແປ ອັດຕະໂນມັດ ລະງັບ ຊົ່ວຄາວ ປອດໄພ ຈໍາເປັນ ສໍາຄັນ ສໍາລັບ ແລ້ວ ພ້ອມ ເລີ່ມ ຕໍ່ໄປ ກ່ອນ ຫຼັງ ອີກ",
  "ໜຶ່ງ ສອງ ສາມ ສີ່ ຫ້າ ຫົກ ເຈັດ ແປດ ເກົ້າ ສິບ ຮ້ອຍ ພັນ ໝື່ນ ແສນ ລ້ານ ຈໍານວນ ທັງໝົດ",
  "ໂຕ ອັນ ຫົວ ຄັນ ແຜ່ນ ໜ່ວຍ ຕົ້ນ ຄູ່ ຜືນ ທ່ອນ",
  "ນໍ້າ ອາຫານ ເຂົ້າ ໄຟ ລົມ ດິນ ຟ້າ ພູ ດອກໄມ້ ຕົ້ນໄມ້ ໝາ ແມວ ປຶ້ມ ລົດ",
].join(" ");

const KHMER = [
  "នេះ នោះ និង របស់ ក្នុង ជា មាន មិន បាន ឱ្យ នឹង ជាមួយ ពី ប៉ុន្តែ ឬ ក៏ នៅ មក ទៅ ដែល",
  "ខ្ញុំ អ្នក យើង គេ គាត់ លោក នាង ពួក មនុស្ស អ្វី ណា ដូច គ្រប់ ខ្លះ ច្រើន តិច ល្អ ថ្មី ចាស់ ធំ",
  "ថ្ងៃ ខែ ឆ្នាំ ម៉ោង នាទី វិនាទី សប្តាហ៍ ពេល ដង រឿង វត្ថុ",
  "ភាសា ខ្មែរ ពាក្យ សារ ព័ត៌មាន ប្រព័ន្ធ ម៉ាស៊ីន ទូរស័ព្ទ កុំព្យូទ័រ គេហទំព័រ ទំព័រ ប៊ូតុង រូបភាព ឯកសារ បញ្ជី",
  "ឈ្មោះ នាមត្រកូល អាសយដ្ឋាន អ៊ីមែល លេខ សម្ងាត់ គណនី អ្នកប្រើ សមាជិក ចុះឈ្មោះ ចូល ចេញ បញ្ចូល",
  "តម្លៃ លុយ រៀល ថ្លៃ ផ្ញើ ទំនិញ បញ្ជា ទិញ លក់ បង់ ទូទាត់ សរុប ពន្ធ បញ្ចុះតម្លៃ សេវា អតិថិជន ហាង",
  "សូម អរគុណ សួស្តី ជួយ ណែនាំ ទាក់ទង សួរ",
  "ស្រឡាញ់ ចូលចិត្ត ត្រូវការ ចង់ គិត ដឹង យល់ ឃើញ មើល ស្តាប់ និយាយ អាន សរសេរ រៀន បង្រៀន ធ្វើ ការងារ ផ្ទះ ក្រុង",
  "ប្រទេស ខេត្ត រាជធានី ភ្នំពេញ ផ្លូវ សង្កាត់ ខណ្ឌ",
  "សម្រេច ខុស ត្រូវ ព្យាយាម រក ទេ ហើយ រួម សម្រាប់ ចង់ ពិនិត្យ បញ្ជាក់ បោះបង់ រក្សាទុក កែសម្រួល លុប បន្ថែម ស្វែងរក ជ្រើសរើស ប្តូរ ធ្វើបច្ចុប្បន្នភាព បិទ បើក",
  "គាំទ្រ បកប្រែ ស្វ័យប្រវត្តិ ផ្អាក បណ្តោះអាសន្ន សុវត្ថិភាព សំខាន់ ចាំបាច់ រួចរាល់ ចាប់ផ្តើម បន្ទាប់ មុន ក្រោយ ម្តង ទៀត",
  "មួយ ពីរ បី បួន ប្រាំ ប្រាំមួយ ប្រាំពីរ ប្រាំបី ប្រាំបួន ដប់ រយ ពាន់ ម៉ឺន សែន លាន ចំនួន ទាំងអស់",
  "នាក់ ក្បាល ដុំ គ្រឿង សន្លឹក ដើម គ្រាប់ ខ្នង គូ ផ្ទាំង",
  "ទឹក អាហារ បាយ ភ្លើង ខ្យល់ ដី មេឃ សមុទ្រ ភ្នំ ផ្កា ដើមឈើ ឆ្កែ ឆ្មា សៀវភៅ ឡាន",
].join(" ");

const BURMESE = [
  "နှင့် ရဲ့ မှာ တွင် ဖြစ် ရှိ ပါ တယ် သည် မည် ကို က မ ဟာ နဲ့ လည်း သို့ ထံ အတွက် ဖြင့် နေ ထား ချင် ရ သော မှု ခြင်း ပြီး",
  "ကျွန်တော် ကျွန်မ သင် သူ သူမ ငါ ဒီ ဤ အဲဒီ ဘယ် ဘာ လူ တွေ တို့ များ အားလုံး နည်း ကောင်း သစ် အသစ်",
  "နေ့ လ နှစ် နာရီ မိနစ် စက္ကန့် ရက်သတ္တပတ် အချိန် ကြိမ် အကြောင်း အရာ",
  "ဘာသာ မြန်မာ စာ စကား သတင်း အချက်အလက် စနစ် စက် ဖုန်း ကွန်ပျူတာ ဝဘ်ဆိုက် စာမျက်နှာ ခလုတ် ပုံ ဖိုင် စာရင်း",
  "နာမည် လိပ်စာ အီးမေးလ် စကားဝှက် အကောင့် အသုံးပြုသူ အဖွဲ့ဝင် မှတ်ပုံတင် ဝင် ထွက် ထည့်",
  "ဈေးနှုန်း ငွေ ကျပ် တန်ဖိုး ပို့ ကုန်ပစ္စည်း မှာ ဝယ် ရောင်း ပေးချေ စုစုပေါင်း အခွန် လျှော့ဈေး ဝန်ဆောင်မှု ဖောက်သည် ဆိုင်",
  "ကျေးဇူးပြု၍ ကျေးဇူးတင် မင်္ဂလာပါ ကူညီ အကြံပြု ဆက်သွယ် မေး",
  "ချစ် ကြိုက် လို ထင် သိ နားလည် တွေ့ ကြည့် နား ပြော ဖတ် ရေး သင်ယူ သင်ကြား လုပ် အလုပ် အိမ် မြို့ ဘာသာစကား",
  "နိုင်ငံ တိုင်းဒေသကြီး ပြည်နယ် ရန်ကုန် နေပြည်တော် လမ်း ရပ်ကွက်",
  "အောင်မြင် မှား မှန် ကြိုးစား စစ်ဆေး အတည်ပြု ပယ်ဖျက် သိမ်းဆည်း ပြင်ဆင် ဖျက် ရှာ ရွေး ပြောင်း ပိတ် ဖွင့်",
  "ပံ့ပိုး ဘာသာပြန် အလိုအလျောက် ယာယီ လုံခြုံ အရေးကြီး လိုအပ် အဆင်သင့် စတင် နောက်တစ်ခု ရှေ့ နောက် ထပ်",
  "တစ် နှစ် သုံး လေး ငါး ခြောက် ခုနစ် ရှစ် ကိုး ဆယ် ရာ ထောင် သိန်း သန်း အရေအတွက်",
  "ယောက် ကောင် ခု အုပ် စီး ရွက် ချောင်း လုံး ဆောင် ပင် စုံ ထည်",
  "ရေ အစား ထမင်း မီး လေ မြေ ကောင်းကင် ပင်လယ် တောင် ပန်း သစ်ပင် ခွေး ကြောင် စာအုပ် ကား",
].join(" ");

const CHINESE = [
  "的 了 是 在 有 不 和 就 都 也 很 会 能 要 我 你 您 他 她 们 这 已 被 到 找",
  "那 这个 什么 哪 每 些 多 少 好 新 旧 大 小 高 低 长 短 快 慢 两 含 容易 难",
  "天 月 年 小时 分钟 秒 星期 时间 次 事情 东西 现在 今天 明天 昨天",
  "语言 中文 英文 词 句子 消息 信息 数据 系统 机器 电话 电脑 网站 页面 按钮 图片 文件 列表 详情 例子",
  "名字 姓氏 地址 电子邮件 密码 账户 用户 会员 注册 登录 退出 输入 填写",
  "价格 钱 元 费用 发送 商品 订单 购买 出售 支付 付款 总计 税 折扣 免费 服务 客户 商店",
  "请 谢谢 你好 帮助 建议 联系 询问 欢迎",
  "爱 喜欢 需要 想 认为 知道 理解 看见 看 听 说 读 写 学习 教 做 工作 家 城市",
  "国家 省 市 区 街道 新加坡",
  "成功 失败 错误 正确 尝试 检查 确认 取消 保存 编辑 删除 添加 搜索 选择 更改 更新 下载 关闭 打开",
  "支持 翻译 自动 暂停 暂时 停用 临时 安全 重要 必需 准备 开始 结束 下一个 之前 之后 再",
  "一 二 三 四 五 六 七 八 九 十 百 千 万 亿 数量 全部",
  "个 位 只 本 辆 张 条 颗 座 棵 双 块 件 份",
  "水 食物 米饭 火 风 土 天空 海 山 花 树 狗 猫 书 车",
].join(" ");

const SOURCES: Record<string, string> = {
  th: THAI,
  lo: LAO,
  km: KHMER,
  my: BURMESE,
  "zh-Hans-SG": CHINESE,
};

// ------------------------------------------------------------------- runtime

const built = new Map<string, Lexicon>();
const extra = new Map<string, string[]>();

function build(code: string): Lexicon {
  const words = (SOURCES[code] ?? "").split(/\s+/).filter(Boolean);
  const cost = new Map<string, number>();
  let maxLength = 0;

  words.forEach((word, rank) => {
    if (!cost.has(word)) cost.set(word, Math.log(rank + RANK_OFFSET));
    if (word.length > maxLength) maxLength = word.length;
  });

  // Runtime additions sit at the head of the curve: an application that names
  // a word is asserting it matters in that application.
  for (const word of extra.get(code) ?? []) {
    cost.set(word, Math.log(RANK_OFFSET / 2));
    if (word.length > maxLength) maxLength = word.length;
  }

  return { cost, maxLength };
}

/**
 * The lexicon backing a locale, resolved through the locale registry so that
 * "th-TH" and "shn" reach the Thai and Burmese lists respectively.
 */
export function lexiconFor(locale: string): Lexicon | undefined {
  const def = resolveLocale(locale);
  if (!def) return undefined;

  // Shan is written in the Myanmar script and shares its orthography closely
  // enough that the Burmese list is a better prior than nothing.
  const code = def.code === "shn" ? "my" : def.code;
  if (!SOURCES[code] && !extra.has(code)) return undefined;

  let lex = built.get(code);
  if (!lex) {
    lex = build(code);
    built.set(code, lex);
  }
  return lex;
}

/**
 * Add words to a locale's lexicon. Use it for product vocabulary the shipped
 * lists cannot know: brand names, feature names, local place names.
 *
 * registerWords("th", ["เซลากาตะ", "ลาซาด้า"]);
 */
export function registerWords(locale: string, words: readonly string[]): void {
  const def = resolveLocale(locale);
  const code = def?.code === "shn" ? "my" : (def?.code ?? locale);
  const list = extra.get(code) ?? [];
  list.push(...words.filter((w) => w.length > 0));
  extra.set(code, list);
  built.delete(code); // rebuilt lazily on next use
}

/** Number of entries a locale's lexicon holds. Exposed for diagnostics. */
export function lexiconSize(locale: string): number {
  return lexiconFor(locale)?.cost.size ?? 0;
}
