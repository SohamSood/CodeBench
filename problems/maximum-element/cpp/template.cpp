#include <vector>
#include <algorithm>

class Solution {
public:
    int findMax(std::vector<int>& nums) {
        int maxVal = nums[0];
        for (size_t i = 1; i < nums.size(); i++) {
            if (nums[i] > maxVal) maxVal = nums[i];
        }
        return maxVal;
    }
};
