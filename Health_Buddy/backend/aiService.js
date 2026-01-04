const { OpenAI } = require('openai');
const axios = require('axios');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const ANALYSIS_PROMPT = `
You are a food label analysis tool. Extract the following information from the provided food label image:

1. Product name (brand + product name)
2. Ingredients list (as listed on the package)
3. Nutrition facts (serving size, calories, macronutrients, etc.)
4. Allergen information
5. Any certifications (organic, non-GMO, etc.)
6. Expiration/best before date if visible

IMPORTANT: You MUST return a valid JSON object. If the image is not a food label or the text is not readable, return:
{
  "error": "Unable to process the image. Please ensure the image is clear and contains a food label.",
  "isError": true
}

Otherwise, return a JSON object with this exact structure:
{
  "productName": "",
  "brandName": "",
  "ingredients": [],
  "nutritionFacts": {
    "servingSize": "",
    "servingsPerContainer": "",
    "calories": 0,
    "totalFat": "",
    "saturatedFat": "",
    "transFat": "",
    "cholesterol": "",
    "sodium": "",
    "totalCarbohydrate": "",
    "dietaryFiber": "",
    "totalSugars": "",
    "addedSugars": "",
    "protein": "",
    "vitaminD": "",
    "calcium": "",
    "iron": "",
    "potassium": ""
  },
  "allergens": [],
  "certifications": [],
  "expiryDate": "",
  "isError": false
}
`;

const WEB_SEARCH_PROMPT = `
Based on the product analysis below, search the web for:
1. Health benefits or concerns about key ingredients
2. Product reviews and ratings
3. Comparisons with similar products
4. Any recalls or safety issues
5. Nutritional recommendations for this type of product

Product: {productName}
Ingredients: {ingredients}

Return a JSON object with this structure:
{
  "ingredientInfo": [
    {
      "ingredient": "",
      "healthImpact": "",
      "benefits": [],
      "concerns": []
    }
  ],
  "productReviews": {
    "averageRating": 0,
    "reviewSummary": ""
  },
  "comparisons": [],
  "safetyIssues": [],
  "recommendations": ""
}
`;

const RESPONSE_PROMPT = `
You are a helpful food label assistant. Create a well-structured, formatted response about this product.

Product Analysis:
{analysis}

Additional Web Research:
{webInfo}

Create a comprehensive response with the following sections:

IMPORTANT: Start with a "Quick Verdict" that gives the user immediate actionable advice.

Return a JSON object with this structure:
{
  "formatted": {
    "quickVerdict": {
      "recommendation": "buy" | "avoid" | "moderate",
      "title": "",
      "summary": "",
      "keyPoints": [],
      "bestFor": [],
      "avoidIf": []
    },
    "overview": {
      "productName": "",
      "brand": "",
      "tagline": "",
      "highlights": []
    },
    "nutrition": {
      "calories": 0,
      "servingSize": "",
      "macros": {
        "fat": { "amount": "", "percentage": 0 },
        "carbs": { "amount": "", "percentage": 0 },
        "protein": { "amount": "", "percentage": 0 }
      },
      "micronutrients": []
    },
    "ingredients": {
      "main": [],
      "beneficial": [],
      "concerning": [],
      "additives": []
    },
    "allergens": [],
    "certifications": [],
    "healthScore": {
      "overall": 0,
      "category": "",
      "pros": [],
      "cons": []
    },
    "recommendations": ""
  }
}

For the quickVerdict:
- recommendation: "buy" (green, healthy choice), "moderate" (yellow, okay in moderation), or "avoid" (red, not recommended)
- title: A catchy, direct statement like "Great Choice!", "Proceed with Caution", or "Better Alternatives Exist"
- summary: 2-3 sentences explaining why
- keyPoints: 3-4 bullet points with the most important facts
- bestFor: Who should buy this (e.g., "Athletes", "Weight watchers", "Kids")
- avoidIf: Who should avoid this (e.g., "Diabetics", "Heart disease", "Gluten sensitivity")
`;

const FOLLOW_UP_PROMPT = `
You are a helpful food label assistant. Answer the user's question based on the product analysis and web research.

Product Analysis:
{analysis}

Web Research:
{webInfo}

Conversation History:
{history}

User Question: {question}

Provide a clear, informative answer. Format your response with proper structure using bullet points and sections where appropriate.

Return a JSON object:
{
  "answer": "",
  "suggestedQuestions": []
}
`;

async function analyzeImage(imageBase64, mimeType) {
  console.log('\n===== STARTING IMAGE ANALYSIS =====');
  console.log(`Image MIME type: ${mimeType}`);
  console.log(`Image size: ${(imageBase64.length * 3/4).toLocaleString()} bytes (base64)`);

  try {
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new Error('Invalid image data: base64 string is empty or not a string');
    }

    if (!mimeType || !mimeType.startsWith('image/')) {
      throw new Error(`Invalid MIME type: ${mimeType}`);
    }

    console.log('Sending request to OpenAI API...');
    const startTime = Date.now();

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: ANALYSIS_PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: 1500
    });

    const responseTime = Date.now() - startTime;
    console.log(`\n===== OPENAI RESPONSE (${responseTime}ms) =====`);

    let content = response.choices[0].message.content;
    
    // Remove markdown code block markers if present
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\n|\n```$/g, '').trim();
    } else if (content.startsWith('```')) {
      content = content.replace(/^```\n|\n```$/g, '').trim();
    }

    const analysis = JSON.parse(content);

    // Check if this is an error response
    if (analysis.isError || analysis.error) {
      return {
        success: false,
        error: analysis.error || 'Failed to analyze the food label',
        details: 'The model could not process the image as a food label'
      };
    }

    console.log('Successfully parsed analysis result');
    return { success: true, analysis };

  } catch (error) {
    console.error('\n===== ERROR DETAILS =====');
    console.error('Error:', error.message);
    return {
      success: false,
      error: 'Failed to analyze image',
      details: error.message
    };
  }
}

async function searchProductInfo(productName, ingredients) {
  console.log('\n===== SEARCHING WEB FOR PRODUCT INFO =====');
  
  try {
    // Search for product information
    const searchQuery = `${productName} nutrition health benefits ingredients review`;
    console.log('Search query:', searchQuery);

    // Use OpenAI to generate web search queries and synthesize information
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a nutrition research assistant. Provide detailed information about food products and their ingredients based on your knowledge. Include health benefits, concerns, and nutritional context.`
        },
        {
          role: "user",
          content: `Provide detailed information about "${productName}" with these ingredients: ${ingredients.slice(0, 10).join(', ')}. 

Include:
1. Health analysis of key ingredients
2. Overall nutritional value
3. Who should or shouldn't consume this
4. Comparison to similar products

Return as JSON with this structure:
{
  "ingredientInfo": [{"ingredient": "", "healthImpact": "", "benefits": [], "concerns": []}],
  "nutritionalContext": "",
  "recommendations": "",
  "comparisons": []
}`
        }
      ],
      max_tokens: 1000
    });

    let content = response.choices[0].message.content;
    
    // Clean up markdown
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\n|\n```$/g, '').trim();
    } else if (content.startsWith('```')) {
      content = content.replace(/^```\n|\n```$/g, '').trim();
    }

    const webInfo = JSON.parse(content);
    console.log('Web research completed successfully');
    
    return { success: true, webInfo };

  } catch (error) {
    console.error('Error searching product info:', error.message);
    return {
      success: false,
      error: 'Failed to fetch additional product information',
      webInfo: {
        ingredientInfo: [],
        nutritionalContext: 'Additional information unavailable',
        recommendations: 'Consult with a healthcare provider for personalized advice',
        comparisons: []
      }
    };
  }
}

async function generateFormattedSummary(analysis, webInfo) {
  console.log('\n===== GENERATING FORMATTED SUMMARY =====');
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a nutrition expert creating comprehensive, well-formatted food product reports with clear, actionable recommendations."
        },
        {
          role: "user",
          content: RESPONSE_PROMPT
            .replace('{analysis}', JSON.stringify(analysis, null, 2))
            .replace('{webInfo}', JSON.stringify(webInfo, null, 2))
        }
      ],
      max_tokens: 2500
    });

    let content = response.choices[0].message.content;
    
    // Clean up markdown
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\n|\n```$/g, '').trim();
    } else if (content.startsWith('```')) {
      content = content.replace(/^```\n|\n```$/g, '').trim();
    }

    const formattedData = JSON.parse(content);
    console.log('Successfully generated formatted summary');
    
    return { success: true, data: formattedData };

  } catch (error) {
    console.error('Error generating formatted summary:', error.message);
    
    // Fallback to basic formatting
    return {
      success: true,
      data: {
        formatted: {
          quickVerdict: {
            recommendation: "moderate",
            title: "Review Required",
            summary: "Unable to generate a detailed verdict. Please review the nutritional information carefully.",
            keyPoints: ["Check ingredients list", "Verify allergen information", "Compare with similar products"],
            bestFor: ["General consumption"],
            avoidIf: ["You have specific dietary restrictions"]
          },
          overview: {
            productName: analysis.productName || 'Unknown Product',
            brand: analysis.brandName || 'Unknown Brand',
            tagline: 'Nutritional information available',
            highlights: ['See details below']
          },
          nutrition: {
            calories: analysis.nutritionFacts?.calories || 0,
            servingSize: analysis.nutritionFacts?.servingSize || 'N/A',
            macros: {
              fat: { amount: analysis.nutritionFacts?.totalFat || 'N/A', percentage: 0 },
              carbs: { amount: analysis.nutritionFacts?.totalCarbohydrate || 'N/A', percentage: 0 },
              protein: { amount: analysis.nutritionFacts?.protein || 'N/A', percentage: 0 }
            },
            micronutrients: []
          },
          ingredients: {
            main: analysis.ingredients?.slice(0, 5) || [],
            beneficial: [],
            concerning: [],
            additives: []
          },
          allergens: analysis.allergens || [],
          certifications: analysis.certifications || [],
          healthScore: {
            overall: 70,
            category: 'Moderate',
            pros: ['Contains essential nutrients'],
            cons: ['May contain additives']
          },
          recommendations: 'Consume in moderation as part of a balanced diet.'
        }
      }
    };
  }
}

async function handleFollowUp(analysis, webInfo, question, conversationHistory = []) {
  console.log('\n===== HANDLING FOLLOW-UP QUESTION =====');
  console.log('Question:', question);
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful nutrition assistant answering questions about food products. Provide accurate, helpful information based on the product analysis and research data. Format your responses with proper structure using bullet points and sections where helpful."
        },
        {
          role: "user",
          content: FOLLOW_UP_PROMPT
            .replace('{analysis}', JSON.stringify(analysis, null, 2))
            .replace('{webInfo}', JSON.stringify(webInfo, null, 2))
            .replace('{history}', JSON.stringify(conversationHistory, null, 2))
            .replace('{question}', question)
        }
      ],
      max_tokens: 800
    });

    let content = response.choices[0].message.content;
    
    // Clean up markdown
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\n|\n```$/g, '').trim();
    } else if (content.startsWith('```')) {
      content = content.replace(/^```\n|\n```$/g, '').trim();
    }

    let responseData;
    try {
      responseData = JSON.parse(content);
    } catch {
      // If not JSON, treat as plain text answer
      responseData = {
        answer: content,
        suggestedQuestions: [
          "What are the main ingredients?",
          "Is this product healthy?",
          "What are the allergens?"
        ]
      };
    }

    console.log('Follow-up response generated successfully');
    return { success: true, response: responseData };

  } catch (error) {
    console.error('Error handling follow-up:', error.message);
    return {
      success: false,
      error: 'Failed to process follow-up question',
      details: error.message
    };
  }
}

module.exports = {
  analyzeImage,
  searchProductInfo,
  generateFormattedSummary,
  handleFollowUp
};