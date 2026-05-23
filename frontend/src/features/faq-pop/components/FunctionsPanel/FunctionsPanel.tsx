// @ts-nocheck
import { useState, useRef, useEffect } from 'react';
import RunTile from './RunTile';
import StateTable from './StateTable';
import { runFull } from '../../api';

export const STATE_NAMES = [
  'A And N Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam',
  'Bihar', 'Chhattisgarh', 'Dadra And Nagar Haveli', 'Daman And Diu',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jammu And Kashmir', 'Jharkand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamilnadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
].sort();

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
  'Barnyard Millet', 'Barley', 'Bay Leaf', 'Beekeeping', 'Beetroot', 'Bengal Gram',
  'Ber', 'Berseem', 'Betel Vine', 'Birdwood Grass', "Bishop's Weed", 'Bitter Gourd',
  'Black Gram', 'Bottle Gourd', 'Broad Bean', 'Brinjal', 'Broccoli',
  'Brussels Sprouts', 'Buckwheat', 'Buffel Grass', 'Bush Squash', 'Butter Pea',
  'Cabbage', 'Cardamom', 'Carnation', 'Carrot', 'Castor', 'Cashew', 'Cauliflower',
  'Celery', 'Chapan Kaddu', 'Chestnut', 'Capsicum', 'Chillies', 'China Aster', 'Chinese Cabbage',
  'Chinar Tree', 'Chrysanthemum', 'Cinnamon', 'Citrus', 'Clove', 'Cluster Bean',
  'Cocoa', 'Coconut', 'Coffee', 'Coleus', 'Colocasia', 'Coriander', 'Cotton',
  'Cowpea', 'Crossandra', 'Cucumber', 'Cumin', 'Curry Leaf', 'Custard Apple',
  'Cymbidium', 'Dhaincha', 'Dharaf Grass', 'Dinanath Grass', 'Dill Seed',
  'Dolichos Bean', 'Drumstick', 'Elephant Foot Yam', 'Eucalyptus', 'Faba Bean',
  'Fennel', 'Fenugreek', 'Fig', 'Finger Millet', 'Fodder Sorghum', 'Foxtail Millet',
  'French Bean', 'Garden Pea', 'Garlic', 'Gerbera', 'Ginger', 'Gladiolus',
  'Golden Timothy', 'Grape', 'Greater Yam', 'Green Gram', 'Groundnut', 'Guar',
  'Guava', 'Guinea Grass', 'Gunda', 'Hemp', 'Hibiscus', 'Honey Plant', 'Horse Gram',
  'Indian Bean', 'Indian Clover', 'Ivy Gourd', 'Jackfruit', 'Jamun', 'Jasmine',
  'Jatropha', 'Jojoba', 'Jute', 'Karan Rai', 'Karonda', 'Kidney Bean', 'Kiwi Fruit',
  'Knol-Khol', 'Kodo Millet', 'Kokum', 'Kolanchi', 'Lablab Bean', 'Large Cardamom',
  'Lathyrus', 'Leafy Vegetable', 'Lehberry', 'Lemon', 'Lentil', 'Lesser Yam',
  'Lettuce', 'Lilies', 'Linseed', 'Litchi', 'Little Millet', 'Long Melon', 'Loquat',
  'Lucerne', 'Maize', 'Mango', 'Marigold', 'Marvel Grass', 'Melon', 'Mesta', 'Mint',
  'Mosambi', 'Moth Bean', 'Mulberry', 'Mushroom', 'Muskmelon', 'Mustard',
  'Napier Grass', 'Neem', 'Niger', 'Nutmeg', 'Oats', 'Oil Palm', 'Okra', 'Oleander',
  'Olive', 'Onion', 'Opium Poppy', 'Orange', 'Paddy', 'Palmyra', 'Papaya',
  'Passion Fruit', 'Pea', 'Peach', 'Pecan Nut', 'Pearl Millet', 'Pear', 'Periwinkle',
  'Persian Clover', 'Persimmon', 'Pigeon Pea', 'Pillipesara', 'Pineapple', 'Plum',
  'Pointed Gourd', 'Pomegranate', 'Poplar', 'Potato', 'Proso Millet', 'Pumpkin',
  'Radish', 'Red Clover', 'Ribbed Gourd', 'Ricebean', 'Ridge Gourd', 'Rocket Salad',
  'Rose', 'Roselle', 'Round Melon', 'Rubber', 'Runner Bean', 'Ryegrass', 'Safed Musli',
  'Safflower', 'Saffron', 'Sal Wood', 'Sandalwood', 'Sapota', 'Sen Grass', 'Sesame',
  'Setaria Grass', 'Shatavari', 'Snap Melon', 'Snake Gourd', 'Sorghum', 'Soybean',
  'Spinach', 'Spine Gourd', 'Sponge Gourd', 'Stevia', 'Strawberry', 'Stylosanthes',
  'Sudan Grass', 'Sugar Beet', 'Sugarcane', 'Summer Squash', 'Sunflower', 'Sunnhemp',
  'Sweet Cherry', 'Sweet Potato', 'Tall Fescue Grass', 'Tapioca', 'Tea', 'Teak',
  'Teosinte', 'Tobacco', 'Tomato', 'Triticale', 'Tuberose', 'Tulsi', 'Tumba',
  'Turmeric', 'Turnip', 'Vanilla', 'Velimasal', 'Walnut', 'Watermelon', 'Wheat',
  'White Clover', 'White Yam', 'Winged Bean', 'Yard Long Bean', 'Zantedeschia',
].filter((v, i, a) => a.indexOf(v) === i).sort();

const FULL_FIELDS = [
  { key: 'state',       label: 'State',   type: 'states-selector' },
  { key: 'crops',       label: 'Crops',   type: 'crops-selector' },
  { key: 'domains',     label: 'Domains', type: 'domains-selector' },
  { key: 'skip_qa_gen', label: 'Skip QA gen', type: 'checkbox' },
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
