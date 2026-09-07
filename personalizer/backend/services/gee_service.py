import os
import ee
from datetime import datetime, timedelta

class GEEService:
    def __init__(self):
        self.api_status = {'gee': False}
        self.initialize_gee()

    def initialize_gee(self):
        try:
            # Try service account authentication first
            service_account = os.getenv('GEE_SERVICE_ACCOUNT')
            private_key_path = os.getenv('GEE_PRIVATE_KEY_PATH')
            
            if service_account and private_key_path and os.path.exists(private_key_path):
                credentials = ee.ServiceAccountCredentials(service_account, private_key_path)
                ee.Initialize(credentials, project=os.getenv('GEE_PROJECT_ID'))
                print("GEE Initialized with Service Account")
                self.api_status['gee'] = True
                return True
            else:
                # Try to initialize with existing credentials (needs manual login first time)
                ee.Initialize(project=os.getenv('GEE_PROJECT_ID'))
                print("GEE Initialized with Default Credentials")
                self.api_status['gee'] = True
                return True
        except Exception as e:
            print(f"GEE Initialization Failed: {str(e)}")
            self.api_status['gee'] = False
            return False

    def is_farmland_area(self, latitude, longitude):
        if not self.api_status['gee']:
            raise Exception("GEE Offline")

        try:
            point = ee.Geometry.Point([longitude, latitude])
            dataset = ee.ImageCollection("ESA/WorldCover/v200").first()
            result = dataset.select('Map').reduceRegion(
                reducer=ee.Reducer.first(),
                geometry=point,
                scale=10
            ).getInfo()
            
            land_cover = result.get('Map')
            
            if land_cover == 50:
                raise Exception("Location is a BUILT-UP AREA (City/Urban). Analysis Rejected.")
            if land_cover == 80:
                raise Exception("Location is a WATER BODY. Analysis Rejected.")
            if land_cover in [90, 95]:
                raise Exception("Location is a WETLAND/MANGROVE (Protected/Non-Arable). Analysis Rejected.")
            if land_cover == 60:
                raise Exception("Location is BARE LAND (No Soil/Vegetation). Analysis Rejected.")
                
            valid_classes = [10, 20, 30, 40]
            if land_cover in valid_classes:
                return True
            
            raise Exception(f"Land Class {land_cover} not suitable for agriculture.")
        except Exception as e:
            raise Exception(f"Validation Error: {e}")

    def get_satellite_data(self, latitude, longitude):
        if not self.is_farmland_area(latitude, longitude):
            raise Exception("Geospatial Validation Failed: Location is not agricultural land.")
        
        if not self.api_status['gee']:
            raise Exception("Google Earth Engine not initialized.")
        
        try:
            point = ee.Geometry.Point([longitude, latitude])
            buffer_area = point.buffer(100)
            
            # --- 1. SENTINEL-2 (Vegetation) ---
            # Search only the last 45 days for real-time accuracy
            s2_collection = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                          .filterBounds(buffer_area)
                          .filterDate((datetime.now() - timedelta(days=45)).strftime('%Y-%m-%d'), 
                                    datetime.now().strftime('%Y-%m-%d')))
            
            if s2_collection.size().getInfo() == 0:
                raise Exception("No satellite view available in the last 45 days.")
            
            # First, try to get the most recent clear image (< 30% clouds)
            clear_images = s2_collection.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30)).sort('system:time_start', False)
            
            if clear_images.size().getInfo() > 0:
                image = clear_images.first()
            else:
                # Fallback: Monsoons/heavy clouds. Get the clearest image available in the 45-day window.
                image = s2_collection.sort('CLOUDY_PIXEL_PERCENTAGE', True).first()
            
            ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
            gndvi = image.normalizedDifference(['B8', 'B3']).rename('GNDVI')
            ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI')
            savi = image.expression(
                '((NIR - RED) / (NIR + RED + 0.5)) * 1.5', {
                    'NIR': image.select('B8'),
                    'RED': image.select('B4')
                }).rename('SAVI')

            indices_values = ee.Image.cat([ndvi, gndvi, ndwi, savi]).reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=buffer_area,
                scale=10
            ).getInfo()

            # --- 2. SOIL MOISTURE ---
            soil_moisture_val = None
            source_tag = "N/A"

            try:
                smap_collection = (ee.ImageCollection('NASA_USDA/HSL/SMAP10KM_soil_moisture')
                                   .filterBounds(point)
                                   .filterDate((datetime.now() - timedelta(days=45)).strftime('%Y-%m-%d'), 
                                               datetime.now().strftime('%Y-%m-%d'))
                                   .sort('system:time_start', False))
                
                if smap_collection.size().getInfo() > 0:
                    smap_image = smap_collection.first()
                    sm_dict = smap_image.reduceRegion(
                        reducer=ee.Reducer.mean(),
                        geometry=point.buffer(5000), 
                        scale=10000 
                    ).getInfo()
                    
                    if 'ssm' in sm_dict and sm_dict['ssm'] is not None:
                        soil_moisture_val = sm_dict['ssm']
                        source_tag = "NASA SMAP"
            except Exception:
                pass 

            if soil_moisture_val is None:
                ndwi_val = indices_values.get('NDWI', 0)
                soil_moisture_val = 30.0 + (ndwi_val * 40.0)
                soil_moisture_val = max(5.0, min(90.0, soil_moisture_val))
                source_tag = "Calculated (NDWI)"

            # --- 3. LAND SURFACE TEMPERATURE (LST) ---
            lst_val = None
            try:
                modis_lst = (ee.ImageCollection("MODIS/061/MOD11A1")
                            .filterBounds(point)
                            .filterDate((datetime.now() - timedelta(days=15)).strftime('%Y-%m-%d'), 
                                        datetime.now().strftime('%Y-%m-%d'))
                            .sort('system:time_start', False))
                if modis_lst.size().getInfo() > 0:
                    lst_img = modis_lst.first()
                    lst_dict = lst_img.select('LST_Day_1km').reduceRegion(
                        reducer=ee.Reducer.mean(),
                        geometry=point.buffer(1000),
                        scale=1000
                    ).getInfo()
                    if 'LST_Day_1km' in lst_dict and lst_dict['LST_Day_1km'] is not None:
                        lst_val = (lst_dict['LST_Day_1km'] * 0.02) - 273.15
            except Exception:
                pass

            # --- 4. AVERAGE RAINFALL (CHIRPS) ---
            rain_val = None
            try:
                chirps = (ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
                          .filterBounds(point)
                          .filterDate((datetime.now() - timedelta(days=45)).strftime('%Y-%m-%d'), 
                                      datetime.now().strftime('%Y-%m-%d')))
                if chirps.size().getInfo() > 0:
                    rain_img = chirps.mean() # Average daily rainfall over the window
                    rain_dict = rain_img.reduceRegion(
                        reducer=ee.Reducer.mean(),
                        geometry=point.buffer(1000),
                        scale=5000
                    ).getInfo()
                    if 'precipitation' in rain_dict and rain_dict['precipitation'] is not None:
                        rain_val = rain_dict['precipitation']
            except Exception:
                pass

            ndvi_params = {'min': -1, 'max': 1, 'palette': ['blue', 'white', 'green', 'darkgreen']}
            map_id = ndvi.getMapId(ndvi_params)
            
            return {
                'ndvi': indices_values.get('NDVI', 0),
                'gndvi': indices_values.get('GNDVI', 0),
                'ndwi': indices_values.get('NDWI', 0),
                'savi': indices_values.get('SAVI', 0),
                'soil_moisture': soil_moisture_val,
                'lst': lst_val,
                'average_rainfall': rain_val,
                'data_source': source_tag,
                'image_date': image.get('system:time_start').getInfo(),
                'ndvi_url': map_id['tile_fetcher'].url_format
            }
            
        except Exception as e:
            raise Exception(f"Satellite data retrieval failed: {str(e)}")

gee_service = GEEService()
