// @ts-nocheck
import { useState, useRef, useEffect } from 'react';
import RunTile from './RunTile';
import StateTable from './StateTable';
import { runFull } from '../../api';

export const FAQ_STATE_DISTRICTS: Record<string, string[]> = {
  "A AND N ISLANDS": ["NICOBAR", "NORTH AND MIDDLE ANDAMAN", "SOUTH ANDAMAN"],
  "ANDHRA PRADESH": ["ANANTPUR", "CHITTOOR", "EAST GODAVARI", "GUNTUR", "KRISHNA", "KURNOOL", "NELLORE", "PRAKASAM", "SRIKAKULAM", "VISAKHAPATNAM", "VIZIANAGARM", "WEST GODAVARI", "Y S R"],
  "ARUNACHAL PRADESH": ["ANJAW", "CHANGLANG", "EAST KAMENG", "EAST SIANG", "KURUNG KUMEY", "LOHIT", "LONGDING", "LOWER DIBANG VALLEY", "LOWER SUBABSIRI", "PAPUMPARE", "TAWANG", "TIRAP", "UPPER DIBANG VALLEY", "UPPER SIANG", "UPPER SUBANSIRI", "WEST KAMENG", "WEST SIANG"],
  "ASSAM": ["BAKSA", "BARPETA", "BONGAIGAON", "CACHAR", "CHIRANG", "DARRANG", "DHEMAJI", "DHUBRI", "DIBRUGARH", "GOALPARA", "GOLAGHAT", "HAILAKANDI", "JORHAT", "KAMRUP", "KAMRUP METROPOLITAN", "KARBI-ANGLONG", "KARIMGANJ", "KOKRAJHAR", "LAKHIMPUR", "MARIGOAN", "NAGAON", "NALBARI", "NORTH CACHAR HILLS", "SIVASAGAR", "SONITPUR", "TINSUKIA", "UDALGURI"],
  "BIHAR": ["ARARIA", "ARWAL", "AURANGABAD", "BANKA", "BEGUSARAI", "BHAGALPUR", "BHOJPUR", "BUXAR", "DARBHANGA", "GAYA", "GOPALGANJ", "JAMUI", "JEHANABAD", "KAIMUR", "KATIHAR", "KHAGARIA", "KISHANGANJ", "LAKHISARIA", "MADHEPURA", "MADHUBANI", "MUNGER", "MUZAFFARPUR", "NALANDA", "NAWADHA", "PASHCHIM CHAMPARAN", "PATNA", "PURBA CHAMPARAN", "PURNEA", "ROHTAS", "SAHARSA", "SAMASTIPUR", "SARAN", "SHEKHPURA", "SHEOHAR", "SITAMARHI", "SIWAN", "SUPAUL", "VAISHALI"],
  "CHHATTISGARH": ["BASTAR", "BIJAPUR", "BILASPUR", "Balod", "BalodaBazar", "Balrampur", "Bemetara", "DAKSHIN BASTAR DANTEWADA", "DHAMTARI", "DURG", "Gariyaband", "JANJGIR-CHAMPA", "JASHPUR", "KABEERDHAM", "KORBA", "KORIYA", "Kondagaon", "MAHASAMUND", "Mungeli", "NARAYANPUR", "RAIGARH", "RAIPUR", "RAJ NANDGAON", "SURGUJA", "Sukma", "Surajpur", "UTTAR BASTAR KANKER"],
  "DADRA AND NAGAR HAVELI": ["DADRA AND NAGAR HAVELI"],
  "DAMAN AND DIU": ["DAMAN", "DIU"],
  "DELHI": ["CENTRAL DELHI Daryaganj", "EAST DELHI Preet Vihar", "New Delhi Connaught Place", "North Delhi Narela", "North East Delhi Seelampur", "North West Delhi Kanjhawala", "South Delhi Saket", "South West Delhi Dwarka", "West Delhi Rajouri Garden"],
  "GOA": ["GOA NORTH", "GOA SOUTH"],
  "GUJARAT": ["AHMADABAD", "AMRELI", "ANAND", "Aravalli", "BANAS KANTHA", "BHARUCH", "BHAVNAGAR", "Botad", "Chhota Udaipur", "DAHOD", "DANG", "Devbhoomi Dwarka", "GANDHINAGAR", "Gir Somnath", "JAMNAGAR", "JUNAGADH", "KACHCHH", "KHEDA", "Mahisagar", "Mehsana", "Morbi", "NARMADA", "NAVSARI", "PANCH MAHAL", "PATAN", "PORBANDAR", "RAJKOT", "SABARKANTHA", "SURAT", "SURENDRANAGAR", "TAPI", "VADODARA", "VALSAD"],
  "HARYANA": ["AMBALA", "BHIWANI", "CHARKI DADRI", "FARIDABAD", "FATEHABAD", "GURGAON", "HISSAR", "JHAJJAR", "JIND", "KAITHAL", "KARNAL", "KURKSHETRA", "MAHENDRA GARH", "MEWAT", "PALWAL", "PANCHKULA", "PANIPAT", "REWARI", "ROHTAK", "SIRSA", "SONEPAT", "YAMUNA NAGAR"],
  "HIMACHAL PRADESH": ["BILASPUR", "CHAMBA", "HAMIRPUR", "KANGRA", "KINNAUR", "KULLU", "LAHUL AND SPITI", "MANDI", "SHIMLA", "SIRMAUR", "SOLAN", "UNA"],
  "JAMMU AND KASHMIR": ["ANANTNAG", "BADGAM", "BANDIPORE", "BARAMULLA", "DODA", "GANDERBAL", "JAMMU", "KARGIL", "KATHUA", "KISHTWAR", "KULGAM", "KUPWARA", "LEH", "PULWAMA", "PUNCH", "RAJOURI", "RAMBAN", "REASI", "SAMBA", "SHUPIYAN", "SRINAGAR", "UDHAMPUR"],
  "JHARKAND": ["BOKARO", "CHATRA", "DEOGHAR", "DHANBAD", "DUMKA", "EAST SINGHBHUM", "GARHWA", "GIRIDIH", "GODDA", "GUMLA", "HAZARIBAGH", "JAMTARA", "KHUNTI", "KODARMA", "LATEHAR", "LOHARDAGA", "PAKUR", "PALAMU", "RAMGARH", "RANCHI", "SAHIBGANJ", "SERAIKELA", "SIMDEGA", "WEST SINGHBHUM"],
  "KARNATAKA": ["BAGALKOT", "BANGALORE", "BANGALORE RURAL", "BELGAUM", "BELLARY", "BIDAR", "BIJAPUR", "CHAMARAJANAGAR", "CHIKKABALLAPUR", "CHIKMAGALUR", "CHITRADURGA", "DAKSHINAKANNADA", "DAVANAGERE", "DHARWAD", "GADAG", "GULBARGA", "HASSAN", "HAVERI", "KODAGU", "KOLAR", "KOPPAL", "MANDYA", "MYSORE", "RAICHUR", "RAMANAGARA", "SHIMOGA", "TUMKUR", "UDUPI", "UTTARAKANNADA", "YADAGIRI"],
  "KERALA": ["ALAPPUZHA", "ERNAKULAM", "IDUKKI", "KANNUR", "KASARGOD", "KOLLAM", "KOTTAYAM", "KOZHIKODE", "MALAPPURAM", "PALAKKAD", "PATHANAMTHITTA", "THRISSUR", "TRIVANDRUM", "WAYANAD"],
  "MADHYA PRADESH": ["AGAR", "ALIRAJPUR", "ANUPPUR", "ASHOKNAGAR", "BALAGHAT", "BARWANI", "BETUL", "BHIND", "BHOPAL", "BURHANPUR", "CHHATARPUR", "CHHINDWARA", "DAMOH", "DATIA", "DEWAS", "DHAR", "DINDORI", "EAST NIMAR", "GUNA", "GWALIOR", "HARDA", "HOSHANGABAD", "INDORE", "JABALPUR", "JHABUA", "KATNI", "MANDLA", "MANDSAUR", "MORENA", "NARSIMPUR", "NEEMUCH", "PANNA", "RAISEN", "RAJGARH", "RATLAM", "REWA", "SAGAR", "SATNA", "SEHORE", "SEONI", "SHAHDOL", "SHAJAPUR", "SHEOPUR KALA", "SHIVPURI", "SIDHI", "SINGRAULI", "TIKAMGARH", "UJJAIN", "UMARIA", "VIDISHA", "WEST NIMAR"],
  "MAHARASHTRA": ["AHMADNAGAR", "AKOLA", "AMRAVATI", "AURANGABAD", "BEED", "BHANDARA", "BULDANA", "CHANDRAPUR", "DHULE", "GADCHIROLI", "GONDIYA", "HINGOLI", "JALGAON", "JALNA", "KOLHAPUR", "LATUR", "MUMBAI", "Mumbai Suburban", "NAGPUR", "NANDED", "NANDURBAR", "NASIK", "OSMANABAD", "PALGHAR", "PARBHANI", "PUNE", "RAIGARH", "RATNAGIRI", "SANGLI", "SATARA", "SINDHUDURG", "SOLAPUR", "THANE", "WARDHA", "WASHIM", "YEVATMAL"],
  "MANIPUR": ["BISHNUPUR", "CHANDEL", "CHURACHANDPUR", "IMPHAL EAST", "IMPHAL WEST", "SENAPATI", "TAMENGLONG", "THOUBAL", "UKHRUL"],
  "MEGHALAYA": ["EAST GARO HILLS", "EAST JAINTA HILLS", "EAST JAINTIA HILLS", "EAST KHASI HILLS", "NORTH GARO HILLS", "RI BHOI", "SOUTH GARO HILLS", "SOUTH WEST GARO HILLS", "SOUTH WEST KHASI HILLS", "WEST GARO HILLS", "WEST JAINTIA HILLS", "WEST KHASI HILLS"],
  "MIZORAM": ["AIZAWL", "CHAMPHAI", "KOLASIB", "LAWNGTLAI", "LUNGLEI", "MAMIT", "SAIHA", "SERCCHIP"],
  "NAGALAND": ["DIMAPUR", "KIPHRIE", "KOHIMA", "LONGLENG", "MOKOKCHUNG", "MON", "PEREN", "PHEK", "TUENSANG", "WOKHA", "ZUNHEBOTO"],
  "ODISHA": ["ANUGUL", "BALANGIR", "BALASORE", "BARGARH", "BAUDH", "BHADRAK", "CUTTACK", "DEBAGARH", "DHENKANAL", "GAJAPATI", "GANJAM", "JAGATSINGHAPUR", "JAJAPUR", "JHARSUGUDA", "KALAHANDI", "KANDHAMAL", "KENDRAPARA", "KEONJHAR", "KHORDHA", "KORAPUT", "MALKANGIRI", "MAYURBHANJ", "NAWAPARA", "NAWORANGPUR", "NAYAGARH", "PURI", "RAYAGADA", "SAMBALPUR", "SONEPUR", "SUNDARGARH"],
  "PUDUCHERRY": ["KARAIKAL", "MAHE", "PUDUCHERRY", "YANAM"],
  "PUNJAB": ["AMRITSAR", "BARNALA", "BHATINDA", "FARIDKOT", "FATEHGARH SAHIB", "FAZILKA", "FEROZPUR", "GURDASPUR", "HOSHIARPUR", "JALANDHAR", "KAPURTHALA", "LUDHIANA", "MANSA", "MOGA", "MUKTSAR", "PATHANKOT", "PATIALA", "RUPNAGAR", "SAHIBZADA AJIT SINGH NAGAR", "SANGRUR", "SHAHID BHAGAT SINGH NAGAR (Nawanshahr)", "SHAHID BHAGAT SINGH NAGAR Nawanshahr", "TARN TARAN"],
  "RAJASTHAN": ["AJMER", "ALWAR", "BANSWARA", "BARAN", "BARMER", "BHARATPUR", "BHILWARA", "BIKANER", "BUNDI", "CHITTAURGARH", "CHURU", "DAUSA", "DHAULPUR", "DUNGARPUR", "GANGANAGAR", "HANUMANGARH", "JAIPUR", "JAISALMER", "JALOR", "JHALAWAR", "JHUNJHUNU", "JODHPUR", "KARAULI", "KOTA", "NAGAUR", "PALI", "PRATAPGARH", "RAJSAMAND", "SAWAI MADHOPUR", "SIKAR", "SIROHI", "TONK", "UDAIPUR"],
  "SIKKIM": ["EAST DISTRICT", "Gangtok", "Gyalshing", "NORTH DISTRICT", "SOUTH DISTRICT", "WEST DISTRICT"],
  "TAMILNADU": ["ARIYALUR", "CHENGALPATTU", "CHENNAI(MADRAS)", "CHENNAIMADRAS", "COIMBATORE", "CUDDALORE", "DHARMAPURI", "DINDIGUL", "ERODE", "KALLAKURICHI", "KANCHEEPURAM", "KANNIYA KUMARI", "KARUR", "KRISHNAGIRI", "MADURAI", "MAYILADUTHURAI", "NAGAPATTINAM", "NAMAKKAL", "PERAMBALUR", "PUDUKKOTTAI", "RAMANATHAPURAM", "RANIPET", "SALEM", "SIVAGANGA", "TENKASI", "THANJAVUR", "THE NILGIRIS", "THENI", "THIRUVALLUR", "THIRUVARUR", "THOOTHUKUDI", "TIRUCHIRAPPALLI", "TIRUNELVELI", "TIRUPATTUR", "TIRUPUR", "TIRUVANNAMALAI", "VELLORE", "VILLUPPURAM", "VIRUDHUNAGAR"],
  "TELANGANA": ["ADILABAD", "BHADRADRI KOTHAGUDEM", "HYDERABAD", "JAGTIAL", "JANGAON", "JAYASHANKAR BHUPALAPALLY", "JOGULAMBA GADWAL", "KAMAREDDY", "KARIMNAGAR", "KHAMMAM", "KUMARAMBHEEM ASIFABAD", "MAHABOOBNAGAR", "MAHABUBABAD", "MANCHERIAL", "MEDAK", "MEDCHALMALKAJGIRI", "MEDCHAL–MALKAJGIRI", "NAGARKURNOOL", "NALGONDA", "NIRMAL", "NIZAMABAD", "PEDDAPALLI", "RAJANNA SIRCILLA", "RANGAREDDY", "SANGAREDDY", "SIDDIPET", "SURYAPET", "VIKARABAD", "WANAPARTHY", "WARANGAL", "WARANGAL RURAL", "YADADRI BHUVANAGIRI"],
  "TRIPURA": ["DHALAI", "GOMATI", "KHOWAI", "NORTH TRIPURA", "SEPAHIJELA", "SOUTH TRIPURA", "UNAKOTI", "WEST TRIPURA"],
  "UTTAR PRADESH": ["AGRA", "ALIGARH", "ALLAHABAD", "AMBEDKAR NAGAR", "AMETHI  Shahu Ji Maharaj", "AMETHI ( Shahu Ji Maharaj)", "AMROHA", "AURAIYA", "AZAMGARH", "BADAUN", "BAGHPAT", "BAHRAICH", "BALLIA", "BALRAMPUR", "BANDA", "BARABANKI", "BAREILLY", "BASTI", "BIJNOR", "BULANDSHAHAR", "CHANDAULI", "CHITRAKOOT", "DEORIA", "ETAH", "ETAWAH", "FAIZABAD", "FARRUKHABAD", "FATEHPUR", "FIROZABAD", "GAUTAM BUDDHA NAGAR", "GHAZIABAD", "GHAZIPUR", "GONDA", "GORAKHPUR", "HAMIRPUR", "HAPUR (PANCHSHEEL NAGAR)", "HAPUR PANCHSHEEL NAGAR", "HARDOI", "HATHRAS", "JALAUN", "JAUNPUR", "JHANSI", "JYOTIBA PHULE NAGAR", "KANNAUJ", "KANPUR CITY", "KANPUR DEHAT", "KANSHIRAM NAGAR", "KAUSHAMBI", "KHERI", "KUSHI NAGAR", "LALITPUR", "LUCKNOW", "MAHARAHGANJ", "MAHOBA", "MAINPURI", "MATHURA", "MAU", "MEERUT", "MIRZAPUR", "MORADABAD", "MUZAFFARNAGAR", "PILIBHIT", "PRATAPGARH", "RAEBARELI", "RAMPUR", "SAHARANPUR", "SAMBAL (BHIM NAGAR)", "SAMBAL BHIM NAGAR", "SANT KABIR NAGAR", "SANT RAVIDAS NAGAR BHADOHI", "SHAHJAHANPUR", "SHAMLI (PRABUDH NAGER)", "SHAMLI PRABUDH NAGER", "SHIVASTI", "SIDDHARTH NAGAR", "SITAPUR", "SONBHADRA", "SULTANPUR", "UNNAO", "VARANASI"],
  "UTTARAKHAND": ["ALMORA", "BAGESHWAR", "CHAMOLI", "CHAMPAWAT", "DEHRADUN", "HARIDWAR", "NAINITAL", "PAURI GARHWAL", "PITHORAGARH", "RUDRAPRAYAG", "TEHRI GARWAL", "UDHAM SINGH NAGAR", "UTTARKASHI"],
  "WEST BENGAL": ["Alipurduar", "BANKURA", "BARDDHAMAN", "BIRBHUM", "Cooch BIHAR", "DARJEELING", "EAST MEDINIPUR", "HOOGHLY", "HOWRAH", "JALPAIGURI", "KOLKATTA", "MALDAH", "MURSHIDABAD", "NADIA", "NORTH 24 PARGANAS", "North DINAJPUR", "PURULIA", "SOUTH 24 PARGANAS", "South DINAJPUR", "WEST MEDINIPUR"],
};

export const STATE_NAMES = Object.keys(FAQ_STATE_DISTRICTS).sort();

export const DOMAIN_NAMES = [
  'Abiotic Stress Management',
  'Agriculture Mechanization',
  'Bio-Pesticides and Bio-Fertilizers',
  'Breeding -Inbreeding',
  'Cold Storage',
  'Credit',
  'Crop Insurance',
  'Cultural Practices',
  'Disease',
  'Disease (Bacterial)',
  'Disease (Viral)',
  'Disease - External Parasitic',
  'Disease Management',
  'Disease Reporting',
  'Dosage',
  'Feed',
  'Fertilizer Use and Availability',
  'Field Preparation',
  'Floriculture',
  'Harvesting Management',
  'Horticulture',
  'Hormone Imbalance Management',
  'Hormonic Imbalance',
  'Insect Management',
  'Integrated Farming',
  'Irrigation Management',
  'Landscaping',
  'Loans',
  'Management',
  'Medicinal and Aromatic Plants',
  'Mushroom Production',
  'Nursery Management',
  'Nutrient Deficiency/Excessiveness Management',
  'Nutrient Management',
  'Old/Senile Orchard Rejuvenation',
  'OldSenile Orchard Rejuvenation',
  'Organic Farming',
  'Pathogenic Disease Management',
  'Plant Protection',
  'Plasticulture',
  'Post Harvest Management - Abiotic',
  'Post Harvest Management - Biotic',
  'Post Harvest Management Cleaning Grading Packaging Food Processing Cool Chain etc',
  'Post Harvest Management (Cleaning, Grading, Packaging, Food Processing, Cool Chain etc.)',
  'Post Harvest Preservation',
  'Power Roads etc',
  'Power, Roads etc.',
  'Problem Of Soil',
  'Seed Sowing And Treatment',
  'Soil Health Card',
  'Soil Testing',
  'Sowing Time and Weather',
  'Spices and Condiment Crops',
  'Storage',
  'Tank Pond and Reservoir Management',
  'Tank, Pond and Reservoir Management',
  'Training',
  'Training and Exposure Visits',
  'Varietal Selection',
  'Varieties',
  'Varities',
  'Vegetative Propagation and Tissue Culture',
  'Water Management',
  'Water Management Micro Irrigation',
  'Water Management, Micro Irrigation',
  'Weed Management',
].sort();

export const CROP_NAMES = [
  'Acid Lime', 'Almond', 'Aloe Vera', 'Amaranthus', 'Anthurium', 'Aonla', 'Apple', 'Apricot',
  'Arecanut', 'Arum', 'Ash Gourd', 'Avocado', 'Babul', 'Bael', 'Banana',
  'Barnyard Millet', 'Barley', 'Bay Leaf', 'Bean', 'Beekeeping', 'Beetroot', 'Bengal Gram',
  'Ber', 'Berseem', 'Betel Vine', 'Birdwood Grass', "Bishop's Weed", 'Bitter Gourd',
  'Black Gram', 'Bottle Gourd', 'Brinjal', 'Broccoli',
  'Brussels Sprouts', 'Buckwheat', 'Buffel Grass', 'Bush Squash', 'Butter Pea',
  'Cabbage', 'Cardamom', 'Carnation', 'Carrot', 'Castor', 'Cashew', 'Cauliflower',
  'Celery', 'Chapan Kaddu', 'Chestnut', 'Capsicum', 'Chillies', 'China Aster', 'Chinese Cabbage',
  'Chinar Tree', 'Chrysanthemum', 'Cinnamon', 'Citrus', 'Clove',
  'Cocoa', 'Coconut', 'Coffee', 'Coleus', 'Colocasia', 'Coriander', 'Cotton',
  'Cowpea', 'Crossandra', 'Cucumber', 'Cumin', 'Curry Leaf', 'Custard Apple',
  'Cymbidium', 'Dhaincha', 'Dharaf Grass', 'Dinanath Grass', 'Dill Seed','Drumstick', 'Elephant Foot Yam', 'Eucalyptus',
  'Fennel', 'Fenugreek', 'Fig', 'Finger Millet', 'Fodder Sorghum', 'Foxtail Millet',
  'Garden Pea', 'Garlic', 'Gerbera', 'Ginger', 'Gladiolus',
  'Golden Timothy', 'Grape', 'Greater Yam', 'Green Gram', 'Groundnut', 'Guar',
  'Guava', 'Guinea Grass', 'Gunda', 'Hemp', 'Hibiscus', 'Honey Plant', 'Horse Gram',
  'Indian Clover', 'Ivy Gourd', 'Jackfruit', 'Jamun', 'Jasmine',
  'Jatropha', 'Jojoba', 'Jute', 'Karan Rai', 'Karonda', 'Kiwi Fruit',
  'Knol-Khol', 'Kodo Millet', 'Kokum', 'Kolanchi', 'Large Cardamom',
  'Lathyrus', 'Leafy Vegetable', 'Lehberry', 'Lemon', 'Lentil', 'Lesser Yam',
  'Lettuce', 'Lilies', 'Linseed', 'Litchi', 'Little Millet', 'Long Melon', 'Loquat',
  'Lucerne', 'Maize', 'Mango', 'Marigold', 'Marvel Grass', 'Melon', 'Mesta', 'Mint',
  'Mosambi', 'Mulberry', 'Mushroom', 'Muskmelon', 'Mustard',
  'Napier Grass', 'Neem', 'Niger', 'Nutmeg', 'Oats', 'Oil Palm', 'Okra', 'Oleander',
  'Olive', 'Onion', 'Opium Poppy', 'Orange', 'Paddy', 'Palmyra', 'Papaya',
  'Passion Fruit', 'Pea', 'Peach', 'Pecan Nut', 'Pearl Millet', 'Pear', 'Periwinkle',
  'Persian Clover', 'Persimmon', 'Pigeon Pea', 'Pillipesara', 'Pineapple', 'Plum',
  'Pointed Gourd', 'Pomegranate', 'Poplar', 'Potato', 'Proso Millet', 'Pumpkin',
  'Radish', 'Red Clover', 'Ribbed Gourd', 'Ridge Gourd', 'Rocket Salad',
  'Rose', 'Roselle', 'Round Melon', 'Rubber', 'Ryegrass', 'Safed Musli',
  'Safflower', 'Saffron', 'Sal Wood', 'Sandalwood', 'Sapota', 'Sen Grass', 'Sesame',
  'Setaria Grass', 'Shatavari', 'Snap Melon', 'Snake Gourd', 'Sorghum', 'Soybean',
  'Spinach', 'Spine Gourd', 'Sponge Gourd', 'Stevia', 'Strawberry', 'Stylosanthes',
  'Sudan Grass', 'Sugar Beet', 'Sugarcane', 'Summer Squash', 'Sunflower', 'Sunnhemp',
  'Sweet Cherry', 'Sweet Potato', 'Tall Fescue Grass', 'Tapioca', 'Tea', 'Teak',
  'Teosinte', 'Tobacco', 'Tomato', 'Triticale', 'Tuberose', 'Tulsi', 'Tumba',
  'Turmeric', 'Turnip', 'Vanilla', 'Velimasal', 'Walnut', 'Watermelon', 'Wheat',
  'White Clover', 'White Yam', 'Zantedeschia',
].filter((v, i, a) => a.indexOf(v) === i).sort();

const FULL_FIELDS = [
  { key: 'state',       label: 'State',                      type: 'states-selector' },
  { key: 'district',    label: 'District (optional)',         type: 'district-selector', hint: 'Leave blank for a whole-state run' },
  { key: 'crops',       label: 'Crops',                      type: 'crops-selector' },
  { key: 'domains',     label: 'Domains',                    type: 'domains-selector' },
  { key: 'skip_qa_gen', label: 'Skip QA gen',                type: 'checkbox' },
];

export default function FunctionsPanel() {
  const [tableRefreshKey, setTableRefreshKey] = useState(0);
  const formRef = useRef(null);
  const [stacked, setStacked] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setStacked(!entry.isIntersecting),
      { threshold: 0 }
    );
    if (formRef.current) observer.observe(formRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col">
      <div ref={formRef} className="max-w-3xl mx-auto w-full">
        <RunTile
          title="Full Pipeline"
          description="Pre-pipeline → clustering → post-pipeline in one shot"
          fields={FULL_FIELDS}
          onRun={runFull}
          cropNames={CROP_NAMES}
          domainNames={DOMAIN_NAMES}
          stateNames={STATE_NAMES}
          stateDistrictMap={FAQ_STATE_DISTRICTS}
          onJobDone={() => setTableRefreshKey((k) => k + 1)}
          tileKey="full-pipeline"
        />
      </div>
      <div className={`sticky top-0 z-10 bg-background pt-6 h-screen ${stacked ? 'overflow-y-auto' : 'overflow-hidden'}`}>
        <div className="max-w-[96rem] mx-auto w-full">
          <StateTable refreshKey={tableRefreshKey} />
        </div>
      </div>
    </div>
  );
}
