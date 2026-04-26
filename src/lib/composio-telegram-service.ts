export interface FireIncident {
  id: string;
  name: string | null;
  risk: 'low' | 'medium' | 'high' | 'critical' | null;
  lat: number | null;
  lon: number | null;
  containment: number | null;
  last_update: string;
  description?: string | null;
}

export interface TelegramMessageOptions {
  chatId: string;
  incident: FireIncident;
  customMessage?: string;
}

/**
 * Generate emergency alert message for fire incident (Telegram formatted)
 */
export function generateFireAlertMessageTelegram(incident: FireIncident, customMessage?: string): string {
  if (customMessage) {
    return customMessage;
  }

  const riskLevel = incident.risk || 'unknown';
  const incidentName = incident.name || 'Unnamed Fire';
  const containment = incident.containment || 0;
  const coordinates = incident.lat && incident.lon 
    ? `${incident.lat.toFixed(2)}°N, ${incident.lon.toFixed(2)}°W`
    : 'Location TBD';
  
  const riskEmoji = 
    riskLevel === 'critical' ? '🔥🚨' :
    riskLevel === 'high' ? '🔥⚠️' :
    riskLevel === 'medium' ? '⚠️🔥' :
    '🟡';

  const urgencyMessage =
    riskLevel === 'critical' ? '⚠️ *CRITICAL ALERT* - Immediate action required!' :
    riskLevel === 'high' ? '⚠️ *HIGH ALERT* - Take precautions now!' :
    riskLevel === 'medium' ? '⚠️ Moderate risk - Stay informed' :
    'ℹ️ Low risk - For your awareness';

  return `${riskEmoji} *WILDFIRE ALERT*

${urgencyMessage}

🔥 *There is an active wildfire in your area*

*Fire Name:* ${incidentName}
*Risk Level:* ${riskLevel.toUpperCase()}
*Location:* ${coordinates}
*Containment:* ${containment}%

${incident.description ? `\n📋 *Details:* ${incident.description}\n` : ''}
🚒 *Evacua Wildfire Operations*
📞 Stay safe and follow local emergency instructions`;
}

/**
 * Send Telegram message using Telegram Bot API
 */
export async function sendTelegramMessage(options: TelegramMessageOptions): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('Missing TELEGRAM_BOT_TOKEN. Please create a bot with @BotFather on Telegram.');
    }

    const message = generateFireAlertMessageTelegram(options.incident, options.customMessage);
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    const response = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: options.chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    const result = await response.json();
    
    if (!response.ok || !result.ok) {
      throw new Error(`Telegram API error: ${result.description || 'Unknown error'}`);
    }
    
    return {
      success: true,
      messageId: result?.result?.message_id?.toString() || 'success',
    };
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Send emergency alert to configured Telegram chat
 */
export async function sendEmergencyAlertViaTelegram(
  incident: FireIncident, 
  customMessage?: string
): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!chatId) {
    return {
      success: false,
      error: 'TELEGRAM_CHAT_ID not configured.',
    };
  }
  
  return sendTelegramMessage({
    chatId,
    incident,
    customMessage,
  });
}
