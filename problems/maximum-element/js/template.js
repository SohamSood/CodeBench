/**
 * Maximum Element
 * @param {number[]} nums
 * @return {number}
 */
function findMax(nums) {
    let maxVal = nums[0];
    for (let i = 1; i < nums.length; i++) {
        if (nums[i] > maxVal) {
            maxVal = nums[i];
        }
    }
    return maxVal;
}
