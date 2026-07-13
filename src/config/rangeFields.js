// V7.2 "Range" kolonu, PLM'deki bir Extended Field'ın (ölçü/özellik) adıdır;
// her Range adının sabit bir ExtFldId (GUID) karşılığı vardır (kullanıcı görseli).
// "Range Detayı" ise o alanın ExtendedFieldDropDown listesindeki bir değerin
// adıdır; DB'ye yazılan gerçek anahtar o değerin ExtFldDropDownId'sidir
// (DropDownValue). Aynı Name farklı ExtFldId'lerde tekrar edebildiğinden,
// çözümleme mutlaka (ExtFldId + Name) çifti ile yapılır.
const RANGE_FIELDS = [
  { name: 'Detay', extFldId: 'a8af8331-0c65-49e1-94aa-e2abac635749' },
  { name: 'Boy', extFldId: 'b37df9ef-7877-4f8a-b850-b5335cc790db' },
  { name: 'Fit', extFldId: '0e41ca5e-d812-47e5-8b5b-3e018294683b' },
  { name: 'Kol Boyu', extFldId: 'c075b044-335f-4129-a5e7-c51745591e25' },
  { name: 'Kumaş Tipi', extFldId: 'cc4fdbe7-c46e-41e7-8047-29793bccfdd0' },
  { name: 'Yaka', extFldId: '38ba7340-72b8-434b-a246-def36b7db42a' },
  { name: 'Bel', extFldId: 'e8b38ebc-0c41-4bdf-b228-f3ba7d136dd0' }
];

const RANGE_EXT_FLD_IDS = RANGE_FIELDS.map((f) => f.extFldId);

// RangeTag sabit üç değerdir.
const RANGE_TAGS = ['Range1', 'Range2', 'Range3'];

// V7.2 "Life Style Grup" kolonu sabit bir gruplama listesidir.
const RANGE_LIFESTYLE_GROUPS = ['Mono', 'Business', 'Tema', 'Diğer'];

module.exports = { RANGE_FIELDS, RANGE_EXT_FLD_IDS, RANGE_TAGS, RANGE_LIFESTYLE_GROUPS };
