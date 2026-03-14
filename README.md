# 🏭 MRP System — Backend API

A RESTful backend API for the Material Requirements Planning (MRP) system built with **Node.js**, **TypeScript**, and **Supabase**.

---

## 🛠️ Tech Stack

| Technology   | Purpose                    |
|-------------|----------------------------|
| Node.js      | Runtime environment        |
| TypeScript   | Type-safe development      |
| Express.js   | HTTP framework             |
| Supabase     | Database & authentication  |
| Render       | Deployment platform        |

---

## 📁 Project Structure

See [`project-structure.txt`](project-structure.txt) for the full project tree.

src/
├── config/ → Database & external service configuration
├── controllers/ → Request handlers (business logic entry points)
├── middleware/ → Error handling, validation, auth
├── routes/ → API route definitions
├── utils/ → Shared utilities (logger, async handler)
└── server.ts → Application entry point

database/
├── migrations/ → SQL migration files
└── schema/ → Database schema & functions


### 🔄 Update Project Structure

Anytime you add or remove files, regenerate the structure file:

```bash
bash update-structure.sh

This generates a formatted project-structure.txt with file type tags, folder counts, and a summary.

🚀 Getting Started
Prerequisites
Node.js (v18+)
npm
Supabase account & project

Installation
# Clone the repository
git clone https://github.com/Access-S/mrp-system-backend.git
cd mrp-system-backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

Environment Variables
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PORT=3001


📡 API Endpoints
Method	Endpoint	Description
GET	/api/health	Health check
GET	/api/products	List all products
POST	/api/products	Create a product
GET	/api/purchase-orders	List purchase orders
POST	/api/purchase-orders	Create purchase order
GET	/api/bom/:productId	Get BOM for product
GET	/api/forecasts	List forecasts
GET	/api/soh	Stock on hand data
GET	/api/dashboard	Dashboard analytics
POST	/api/import	Excel data import


📂 Related Repositories

Repository	        Description
mrp-system-frontend	React frontend application

📄 License
Private — Internal use only.
