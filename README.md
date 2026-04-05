# Uptime Monitoring System

A collaborative project by Prasad1-S and Ananya Ghosh (github.com/Ananya21-G)

A comprehensive uptime and latency monitoring solution that tracks website availability and performance in real-time.

## Features

- **Real-time Monitoring**: Continuously checks website availability and response times
- **Live Status Updates**: Uses Server-Sent Events (SSE) for instant status updates
- **Performance Metrics**: Tracks latency and uptime percentage
- **Alert System**: Configurable alerts via webhook and email
- **User-Friendly Interface**: Clean, responsive web dashboard
- **Failure Threshold**: Configurable retry logic for failed checks

## Architecture

The system consists of two main components:

### Frontend
- **Technology**: HTML5, CSS3, Vanilla JavaScript
- **Location**: `public/` directory
- **Features**: 
  - Add/remove monitors
  - Real-time status display
  - Performance metrics visualization
  - Responsive design

### Backend
- **Technology**: Motia (TypeScript-based distributed systems framework)
- **Location**: `Uptime-Latency-Monitoring-Backend/` directory
- **Components**:
  - **API Layer**: RESTful endpoints for monitor management
  - **Cron Jobs**: Scheduled monitoring tasks
  - **Event Streams**: Real-time status updates via SSE
  - **State Management**: Persistent storage for monitor configurations

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. **Backend Setup**:
   ```bash
   cd Uptime-Latency-Monitoring-Backend
   npm install
   npm run dev
   ```

2. **Frontend Setup**:
   - No additional setup required
   - Open `public/index.html` in a web browser

### Usage

1. Open `public/index.html` in your browser
2. Enter a website URL in the input field
3. Click "Add Monitor" to start monitoring
4. View real-time status updates and performance metrics

## API Endpoints

- `POST /monitors` - Create a new monitor
- `GET /status/{monitorId}` - Get real-time status updates via SSE

## Configuration

Monitors can be configured with:
- **URL**: Website to monitor
- **Failure Threshold**: Number of consecutive failures before alerting
- **Timeout**: Request timeout in milliseconds
- **Alert Webhook URL**: URL to send alerts to
- **Alert Email**: Email address for notifications

## Development

### Backend Development
```bash
cd Uptime-Latency-Monitoring-Backend
npm run dev  # Start development server
npm run build  # Build for production
```

### Frontend Development
- Edit files in `public/` directory
- No build process required
- Refresh browser to see changes

## Technologies Used

- **Backend**: Motia, TypeScript, BullMQ (queue management)
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Real-time**: Server-Sent Events (SSE)
- **State Management**: Motia state plugin
- **Validation**: Zod schema validation

## Project Structure

```
Uptime-Monitoring-System/
├── public/                    # Frontend files
│   ├── index.html            # Main HTML file
│   ├── app.js               # Frontend JavaScript
│   ├── script.js            # Additional scripts
│   └── styles.css           # Styling
└── Uptime-Latency-Monitoring-Backend/  # Backend code
    ├── src/
    │   ├── api/             # API endpoints
    │   ├── cron/            # Scheduled tasks
    │   ├── events/          # Event handling
    │   └── streams/         # Real-time data streams
    ├── package.json         # Dependencies and scripts
    └── tsconfig.json        # TypeScript configuration
```

## License

This project is open source and available under the [MIT License](LICENSE). Developed collaboratively by Prasad1-S and Ananya Ghosh (github.com/Ananya21-G).

## Contributing

This project was developed collaboratively by Prasad1-S and Ananya Ghosh (github.com/Ananya21-G). For contributions:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request