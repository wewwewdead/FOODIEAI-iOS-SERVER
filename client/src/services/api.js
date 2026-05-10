const BASE_URL = import.meta.env.VITE_BACKEND_URL;

export const uploadFood = async (postData) => {
  try {
    const response = await fetch(`${BASE_URL || 'http://localhost:3001'}/analyze`, {
      method: 'POST',
      body: postData
    });

    if (!response.ok) {
      const errorText = await response.text(); 
      throw new Error(`Server error: ${errorText}`);
    }

    const data = await response.json();
    // console.log(data.analysis);
    return data;
  } catch (error) {
    console.error("Upload failed:", error.message);
    throw error; 
  }
};
export const saveData = async(data) =>{
  // console.log(data);

  try {
    const response = await fetch(`${BASE_URL || 'http://localhost:3001'}/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    })
    const result = await response.json();
    if(!response.ok){
      throw new Error(result.message || 'failed to save data!');
    }
    return result;
  } catch (error) {
    console.error("saving failed:", error.message);
    throw error; 
  }
}

export const fetchFoodLogs = async(userId) => {
  // console.log(userId)
  const response = await fetch(`${BASE_URL || 'http://localhost:3001 '}/getFoodLogs?userId=${userId}`)
  if(!response.ok){
    const error = await response.json();
    throw new Error(error.message);
  }
  const data = await response.json();
  return(data);
}
