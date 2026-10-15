"""Streamlit UI for testing the FFV Generator API.

Run with:
    .venv\\Scripts\\pip.exe install streamlit httpx
    .venv\\Scripts\\streamlit.exe run streamlit_app.py
"""
import httpx
import streamlit as st

API_URL = "http://127.0.0.1:8003/generate-ffv"

AVAILABLE_DOMAINS = [
    "Soil Health and Nutrient Management",
    "Irrigation and Water Management",
    "Pest and Disease Management",
    "Crop Production and Management",
    "Weather and Climate",
    "Harvesting and Post-Harvest",
    "Marketing and Economics",
]

PRESETS = {
    "Select a sample preset...": {"question": "", "answer": "", "domains": []},
    "Wheat: Irrigation & Fertilizer (2 Domains)": {
        "question": "How should I manage irrigation and fertilizers for my wheat crop?",
        "answer": "Wheat needs about 4-6 irrigations, mainly at crown root initiation, tillering, jointing, flowering and grain filling stages. For fertilizers, apply 120 kg Nitrogen, 60 kg Phosphorus, and 40 kg Potash per hectare. Half the nitrogen should be applied at sowing and the remaining half split equally at the first and second irrigations.",
        "domains": ["Irrigation and Water Management", "Soil Health and Nutrient Management"],
    },
    "Wheat: Sowing, Irrigation & Pests (3 Domains)": {
        "question": "How to manage wheat planting, irrigation, and pest control?",
        "answer": "Sow wheat between November 5-25 using a seed drill with 100 kg/ha seed rate and 20-22 cm row spacing. Irrigate at crown root initiation and flowering stages. For termite attacks, treat seeds with chlorpyrifos 20 EC before sowing, and scout for yellow rust during cloudy, humid weather.",
        "domains": ["Crop Production and Management", "Irrigation and Water Management", "Pest and Disease Management"],
    },
    "Auto-Classification (No Domains)": {
        "question": "What is the recommended seed rate and row spacing for wheat?",
        "answer": "For normal sown irrigated wheat, use a seed rate of 100 kg per hectare with row spacing of 20 to 22.5 cm. For late sown conditions, increase seed rate to 125 kg/ha with 18-20 cm row spacing.",
        "domains": [],
    },
}

st.set_page_config(page_title="FFV Generator Test Lab", page_icon="🌾", layout="wide")

st.title("🌾 FFV Generator Test Lab")
st.caption("Interactive test bench for Farmer-Friendly Version (FFV) generation and domain-angle limiting.")

# Preset selector
selected_preset = st.selectbox("Quick Load Preset", list(PRESETS.keys()))
preset_data = PRESETS[selected_preset]

# Layout: 2 Columns (Inputs on left, Output on right)
col_in, col_out = st.columns([1, 1], gap="medium")

with col_in:
    st.subheader("Input Parameters")

    question = st.text_area(
        "1. Question *",
        value=preset_data["question"],
        height=100,
        placeholder="Enter original farming question...",
    )

    answer = st.text_area(
        "2. Detailed Expert Answer *",
        value=preset_data["answer"],
        height=220,
        placeholder="Enter detailed expert answer...",
    )

    domains = st.multiselect(
        "3. Domains (Optional - max 3)",
        options=AVAILABLE_DOMAINS,
        default=preset_data["domains"],
        max_selections=3,
        help="Leave empty for auto-classification, or choose 1 to 3 domains.",
    )

    if len(domains) == 1:
        st.info("ℹ️ **1 Domain selected**: Up to 4 angles allowed.")
    elif len(domains) == 2:
        st.info("ℹ️ **2 Domains selected**: Up to 3 angles per domain (max 6 total).")
    elif len(domains) == 3:
        st.info("ℹ️ **3 Domains selected**: Up to 2 angles per domain (max 6 total).")
    else:
        st.info("ℹ️ **0 Domains selected**: Auto-classification will detect 1 to 3 domains.")

    generate_btn = st.button("🚀 Generate FFVs", type="primary", use_container_width=True)

with col_out:
    st.subheader("Output & Analysis")

    if generate_btn:
        if not question.strip():
            st.error("Question cannot be empty.")
        elif not answer.strip():
            st.error("Answer cannot be empty.")
        else:
            payload = {
                "question": question.strip(),
                "answer": answer.strip(),
            }
            if domains:
                payload["domains"] = domains

            with st.spinner("Calling FFV API (Claude)..."):
                try:
                    response = httpx.post(API_URL, json=payload, timeout=90.0)
                except httpx.ConnectError:
                    st.error(
                        f"Could not connect to FastAPI server at `{API_URL}`.\n\n"
                        "Make sure your server is running in a terminal:\n"
                        "```powershell\n"
                        ".venv\\Scripts\\python.exe -m uvicorn main:app --port 8003\n"
                        "```"
                    )
                    st.stop()
                except Exception as exc:
                    st.error(f"Request failed: {exc}")
                    st.stop()

            if response.status_code == 200:
                data = response.json()
                status = data.get("status", "completed")

                # Status banner
                if status == "completed":
                    st.success(f"✅ **Status: Completed** ({len(data.get('versions', []))} versions generated)")
                elif status == "partial":
                    st.warning(f"⚠️ **Status: Partial** ({len(data.get('versions', []))} versions generated, some skipped/failed)")
                else:
                    st.info("ℹ️ **Status: No Angles** (No versions generated for this answer)")

                # Metadata chips
                m1, m2, m3 = st.columns(3)
                with m1:
                    st.metric("Primary Domain", data.get("domain", "N/A"))
                with m2:
                    st.metric("All Domains", ", ".join(data.get("domains", [])))
                with m3:
                    st.metric("Versions Count", len(data.get("versions", [])))

                # Failed angles warning if present
                if data.get("failed_angles"):
                    st.error(f"Failed Angles: {', '.join(data['failed_angles'])}")

                # Render versions as tabs or expanders
                versions = data.get("versions", [])
                if versions:
                    st.markdown("### Generated Versions")
                    for idx, v in enumerate(versions, 1):
                        with st.expander(f"**Version {idx}**: [{v.get('domain')}] — *{v.get('angle')}*", expanded=True):
                            st.markdown(f"**Farmer Question:** {v.get('question')}")
                            st.markdown(f"**Farmer Answer:** {v.get('answer')}")
                            word_cnt = len(v.get('answer', '').split())
                            st.caption(f"Word count: {word_cnt} words")

                # Raw JSON expander
                with st.expander("View Raw JSON Response"):
                    st.json(data)

            else:
                st.error(f"API Error {response.status_code}")
                try:
                    st.json(response.json())
                except Exception:
                    st.text(response.text)
    else:
        st.write("Click **Generate FFVs** to test.")
