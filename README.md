# WhatsApp Bot with Grok AI

A WhatsApp bot that responds using xAI Grok AI and sends images for specific triggers.

## Features

- Responds to messages using xAI Grok AI
- Sends images when "hello mate" is mentioned
- Personality: Raju - the perfect third friend for Adam and Gal

## Setup

1. Clone this repository
2. Install dependencies: `npm install`
3. Create a `.env` file with your xAI API key:
   ```
   XAI_API_KEY=your_xai_api_key_here
   ```
4. Add your `human.png` image to the root directory
5. Run the bot: `npm start`
6. Scan the QR code with WhatsApp

## Deployment

### Railway (Recommended)
1. Push your code to GitHub
2. Connect your GitHub repo to Railway
3. Add your `XAI_API_KEY` environment variable
4. Deploy!

### Environment Variables
- `XAI_API_KEY`: Your xAI API key

## Usage

Send a message containing "hello mate" to receive the human.png image.
The bot will respond to all other messages using Grok AI with Raju's personality. 