import os
import subprocess
import sys
import shutil

def check_dependencies():
    print("Checking Python packages...")
    packages = ["fastapi", "uvicorn", "pydantic"]
    missing = []
    for pkg in packages:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)
            
    if missing:
        print(f"Missing required packages: {', '.join(missing)}")
        print("Installing missing dependencies...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])
            print("Dependencies successfully installed!")
        except Exception as e:
            print(f"Error installing dependencies: {e}")
            print("Please manually run: pip install fastapi uvicorn pydantic")
            sys.exit(1)
    else:
        print("All required core packages are installed.")

def download_kaggle_data():
    raw_dir = "data/raw"
    os.makedirs(raw_dir, exist_ok=True)
    
    # Check if user has Kaggle credentials set up
    home = os.path.expanduser("~")
    kaggle_json_path = os.path.join(home, ".kaggle", "kaggle.json")
    
    if not os.path.exists(kaggle_json_path):
        print("\n[INFO] Kaggle credentials (~/.kaggle/kaggle.json) not found.")
        print("  -> System will skip downloading and fall back to built-in aggregate reference profiles.")
        print("  -> To calibrate from Kaggle in the future, set up credentials and run:")
        print("     pip install kaggle")
        print("     kaggle datasets download -d cdc/vaccination-coverage-among-children-19-35-months -p data/raw/")
        print("     kaggle datasets download -d sourabhshastri/child-immunization-dataset -p data/raw/")
        return
        
    print("\n[INFO] Kaggle credentials found. Attempting to download datasets for calibration...")
    try:
        import kaggle
        # Download CDC coverage dataset
        kaggle.api.dataset_download_files(
            "cdc/vaccination-coverage-among-children-19-35-months", 
            path=raw_dir, 
            unzip=True
        )
        # Download Child immunization dataset (India)
        kaggle.api.dataset_download_files(
            "sourabhshastri/child-immunization-dataset", 
            path=raw_dir, 
            unzip=True
        )
        print("✔ Real datasets successfully downloaded and calibrated to data/raw/.")
    except Exception as e:
        print(f"⚠️ Kaggle API call failed: {e}")
        print("  -> Skipping live download and falling back to built-in pre-calibrated statistical profiles.")

def main():
    check_dependencies()
    download_kaggle_data()
    
    # Generate initial synthetic data
    print("\nInitializing synthetic data...")
    from src.data_generator import DataGenerator
    dg = DataGenerator(seed=42)
    dg.generate_all()
    
    # Start the FastAPI server
    print("\nStarting the ShieldHealth web server...")
    print("Dashboard will be available at: http://127.0.0.1:8000")
    print("Press Ctrl+C to terminate.")
    
    import uvicorn
    # Start uvicorn server synchronously
    uvicorn.run("src.app:app", host="127.0.0.1", port=8000, reload=True)

if __name__ == "__main__":
    main()
