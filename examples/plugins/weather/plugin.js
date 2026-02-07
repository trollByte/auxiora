/**
 * Weather Plugin — Simple tool plugin with NETWORK permission
 *
 * Demonstrates:
 * - PluginManifest format with permissions
 * - A tool that makes external API calls
 * - Config schema validation
 */

export const plugin = {
  name: 'weather',
  version: '1.0.0',
  description: 'Get current weather for any city',
  permissions: ['NETWORK'],

  tools: [
    {
      name: 'get_weather',
      description: 'Get current weather for a city. Returns temperature, conditions, and humidity.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name (e.g., "London", "New York")' },
          units: { type: 'string', description: 'Temperature units: "metric" (Celsius) or "imperial" (Fahrenheit)' },
        },
        required: ['city'],
      },
      execute: async ({ city, units = 'metric' }) => {
        try {
          // Uses wttr.in — a free weather API that requires no API key
          const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
          const response = await fetch(url);

          if (!response.ok) {
            return { success: false, error: `Weather API error: ${response.status}` };
          }

          const data = await response.json();
          const current = data.current_condition?.[0];

          if (!current) {
            return { success: false, error: `No weather data found for "${city}"` };
          }

          const tempC = parseInt(current.temp_C, 10);
          const tempF = parseInt(current.temp_F, 10);
          const temp = units === 'imperial' ? `${tempF}°F` : `${tempC}°C`;
          const desc = current.weatherDesc?.[0]?.value ?? 'Unknown';
          const humidity = current.humidity;
          const windSpeed = current.windspeedKmph;
          const feelsLikeC = current.FeelsLikeC;
          const feelsLikeF = current.FeelsLikeF;
          const feelsLike = units === 'imperial' ? `${feelsLikeF}°F` : `${feelsLikeC}°C`;

          return {
            success: true,
            output: [
              `Weather in ${city}: ${desc}`,
              `Temperature: ${temp} (feels like ${feelsLike})`,
              `Humidity: ${humidity}%`,
              `Wind: ${windSpeed} km/h`,
            ].join('\n'),
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to fetch weather: ${error.message}`,
          };
        }
      },
    },
  ],
};
