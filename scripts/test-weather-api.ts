/**
 * Test script to verify Open-Meteo Weather API is accessible
 * Run with: npx ts-node scripts/test-weather-api.ts
 */

async function testWeatherAPI() {
  console.log('🧪 Testing Open-Meteo Weather API...\n');

  // Test coordinates (San Francisco)
  const lat = 37.7749;
  const lon = -122.4194;

  console.log(`📍 Test Location: ${lat}, ${lon} (San Francisco)\n`);

  try {
    // Test weather API
    console.log('1️⃣ Testing Weather API...');
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,visibility&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
    
    const weatherResponse = await fetch(weatherUrl);
    
    if (!weatherResponse.ok) {
      console.error(`❌ Weather API failed: ${weatherResponse.status} ${weatherResponse.statusText}`);
      return;
    }

    const weatherData = await weatherResponse.json();
    console.log('✅ Weather API Success!');
    console.log('   Temperature:', weatherData.current.temperature_2m, '°F');
    console.log('   Humidity:', weatherData.current.relative_humidity_2m, '%');
    console.log('   Wind Speed:', weatherData.current.wind_speed_10m, 'mph');
    console.log('   Wind Direction:', weatherData.current.wind_direction_10m, '°');
    console.log();

    // Test air quality API
    console.log('2️⃣ Testing Air Quality API...');
    const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10&timezone=auto`;
    
    const airQualityResponse = await fetch(airQualityUrl);
    
    if (!airQualityResponse.ok) {
      console.warn(`⚠️  Air Quality API failed (non-critical): ${airQualityResponse.status}`);
    } else {
      const airQualityData = await airQualityResponse.json();
      console.log('✅ Air Quality API Success!');
      console.log('   US AQI:', airQualityData.current.us_aqi || 'N/A');
      console.log('   PM2.5:', airQualityData.current.pm2_5 || 'N/A');
      console.log('   PM10:', airQualityData.current.pm10 || 'N/A');
    }

    console.log('\n✨ All tests passed! Weather API is working correctly.\n');

  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    
    if (error instanceof Error) {
      console.error('   Error message:', error.message);
      console.error('   Error name:', error.name);
    }
    
    console.log('\n🔧 Troubleshooting tips:');
    console.log('   1. Check your internet connection');
    console.log('   2. Verify Open-Meteo API is not down: https://api.open-meteo.com/');
    console.log('   3. Check if your firewall is blocking the request');
    console.log('   4. Try the API directly in your browser:', weatherUrl);
  }
}

// Run the test
testWeatherAPI();


